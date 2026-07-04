// js/ai/ai-memory.js
// 我管理记忆的逻辑——自动从对话里抽记忆、写进记忆系统、定期归档老记忆。
// 抽记忆用 MEMORY_PATTERNS 正则匹配（我叫XX / 我喜欢XX / 我的生日是XX月XX日 ...）。
// 归档：超过 100 条时，按重要度从低到高、时间从旧到新排序，把低重要度的标记 archived。
// 依赖：./ai-spec.js, ../../core/memory.js, ../../core/events.js

import { MEMORY_PATTERNS } from './ai-spec.js';
import { recordInteraction, getMemories, updateMemory } from '../../core/memory.js';
import bus from '../../core/events.js';

// ════════════════════════════════════════
// 记忆提取（纯函数）
// ════════════════════════════════════════

/**
 * 我从对话中自动提取值得记住的事。
 * 把用户消息和我的回复拼起来一起匹配，命中 MEMORY_PATTERNS 就生成一条记忆。
 * @param {string} userText 主人的消息
 * @param {string} aiReply 我的回复
 * @param {string} characterId 当前角色 id
 * @returns {Array<{type, content, characterId}>} 提取到的记忆（未写入）
 */
export function extractMemories(userText, aiReply, characterId) {
  const found = [];
  const fullText = `${userText || ''}\n${aiReply || ''}`;
  if (!fullText) return found;

  for (const { pattern, type, template } of MEMORY_PATTERNS) {
    const match = fullText.match(pattern);
    if (match) {
      const content = template
        .replace('$1', match[1] || '')
        .replace('$2', match[2] || '');
      if (content) {
        found.push({ type, content, characterId });
      }
    }
  }
  return found;
}

// ════════════════════════════════════════
// 记忆写入（带副作用）
// ════════════════════════════════════════

/**
 * 我把提取到的记忆写入记忆系统。
 * 走 recordInteraction 统一入口（去重 / 失效缓存 / 通知可视化卡片都由它处理）。
 * @param {string} userText
 * @param {string} aiReply
 * @param {string} characterId
 * @returns {Promise<number>} 实际写入的记忆条数
 */
export async function autoRecordMemories(userText, aiReply, characterId) {
  if (!characterId) return 0;
  const memories = extractMemories(userText, aiReply, characterId);
  if (!memories.length) return 0;
  let count = 0;
  for (const m of memories) {
    try {
      await recordInteraction({
        characterId: m.characterId,
        role: 'user',
        source: 'auto_extract',
        content: m.content,
        importance: 7,
        relatedApp: 'chat'
      });
      count++;
    } catch (e) {
      console.warn('[ai-memory] 我写记忆失败', e);
    }
  }
  if (count > 0) {
    try {
      bus.emit('memory:auto-extracted', { characterId, count });
    } catch (e) {}
  }
  return count;
}

// ════════════════════════════════════════
// 记忆归档（清理老记忆）
// ════════════════════════════════════════

/**
 * 我定期检查并归档老记忆。
 * 规则：超过 100 条时，按重要度从低到高、时间从旧到新排序，把低重要度的标记 archived=true。
 * 归档不删除，只是不再注入上下文（避免上下文爆炸）。
 * @param {string} characterId
 * @returns {Promise<number>} 归档条数
 */
export async function archiveOldMemories(characterId) {
  if (!characterId) return 0;
  let all = [];
  try {
    all = await getMemories(characterId);
  } catch (e) {
    console.warn('[ai-memory] 我读记忆列表失败', e);
    return 0;
  }
  if (!Array.isArray(all) || all.length <= 100) return 0;

  // 按重要度升序、时间升序排（低重要度 + 旧的先归档）
  const toArchive = all
    .filter((m) => m && (m.importance ?? 5) <= 4 && !m.archived)
    .sort((a, b) => {
      const ia = Number(a.importance ?? 5);
      const ib = Number(b.importance ?? 5);
      if (ia !== ib) return ia - ib;
      const ta = new Date(a.timestamp || 0).getTime();
      const tb = new Date(b.timestamp || 0).getTime();
      return ta - tb;
    });

  let archived = 0;
  for (const m of toArchive) {
    // 归档到剩余 100 条为止
    if (all.length - archived <= 100) break;
    try {
      await updateMemory(m.id, { archived: true });
      archived++;
    } catch (e) {
      console.warn('[ai-memory] 我归档单条失败', e);
    }
  }
  if (archived > 0) {
    try {
      bus.emit('memory:archived', { characterId, count: archived });
    } catch (e) {}
  }
  return archived;
}
