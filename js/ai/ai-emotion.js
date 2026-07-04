// js/ai/ai-emotion.js
// 我检测情绪的逻辑——既检测我自己回复里的情绪，也检测主人消息里的情绪。
// 检测到负面情绪时我会写记仇本，检测到道歉时我会原谅主人。
// 依赖：./ai-spec.js, ../../apps/grudge/index.js, ../../core/events.js

import { EMOTION_KEYWORDS } from './ai-spec.js';
import { addGrudgeFromAI, forgiveLatestForCharacter } from '../../apps/grudge/index.js';
import bus from '../../core/events.js';

// ════════════════════════════════════════
// 情绪检测（纯函数）
// ════════════════════════════════════════

/**
 * 我从一段文本里检测情绪。
 * 顺序：negative 优先（避免被 happy 抢先），然后 forgive，最后 happy，都没命中就是 neutral。
 * @param {string} text
 * @returns {{type: 'negative'|'forgive'|'happy'|'neutral', keyword?: string}}
 */
export function detectEmotion(text) {
  const lower = String(text || '').toLowerCase();
  if (!lower) return { type: 'neutral' };
  for (const kw of EMOTION_KEYWORDS.negative) {
    if (lower.includes(kw.toLowerCase())) return { type: 'negative', keyword: kw };
  }
  for (const kw of EMOTION_KEYWORDS.forgive) {
    if (lower.includes(kw.toLowerCase())) return { type: 'forgive', keyword: kw };
  }
  for (const kw of EMOTION_KEYWORDS.happy) {
    if (lower.includes(kw.toLowerCase())) return { type: 'happy', keyword: kw };
  }
  return { type: 'neutral' };
}

// ════════════════════════════════════════
// 情绪处理（带副作用：写记仇本 / 原谅）
// ════════════════════════════════════════

/**
 * 我在回复完成后处理自己和主人的情绪。
 * 规则：
 *   - 我（AI）表达了负面情绪 -> 写记仇本（让主人知道我在意）
 *   - 我（AI）表达了原谅 -> 标记最近一条记仇已原谅
 *   - 主人说了伤人的话 -> 我也写记仇本
 *   - 主人道歉 -> 我原谅
 * 所有副作用都容错，失败只 warn 不抛。
 * @param {string} aiReply 我的回复
 * @param {string} characterId 当前角色 id
 * @param {string} userMessage 主人的消息
 * @returns {Promise<{type, keyword?}>} 我自己的情绪
 */
export async function handleEmotion(aiReply, characterId, userMessage) {
  const aiEmotion = detectEmotion(aiReply);
  const userEmotion = detectEmotion(userMessage);

  // 如果我（AI）表达了负面情绪 -> 写记仇本
  if (aiEmotion.type === 'negative' && characterId) {
    try {
      await addGrudgeFromAI({
        characterId,
        reason: `聊天中感到${aiEmotion.keyword}`,
        source: 'chat',
        level: 3
      });
      bus.emit('grudge:written', {
        characterId,
        reason: aiEmotion.keyword,
        auto: true
      });
    } catch (e) {
      console.warn('[ai-emotion] 我写记仇本失败', e);
    }
  }

  // 如果我（AI）表达了原谅 -> 标记记仇已原谅
  if (aiEmotion.type === 'forgive' && characterId) {
    try {
      await forgiveLatestForCharacter(characterId);
    } catch (e) {
      console.warn('[ai-emotion] 我原谅失败', e);
    }
  }

  // 如果主人说了伤人的话 -> 我也写记仇本
  if (userEmotion.type === 'negative' && characterId) {
    try {
      await addGrudgeFromAI({
        characterId,
        reason: `主人说：${userEmotion.keyword}`,
        source: 'chat',
        level: 2
      });
    } catch (e) {
      console.warn('[ai-emotion] 主人伤人记仇失败', e);
    }
  }

  // 如果主人道歉 -> 我原谅
  if (userEmotion.type === 'forgive' && characterId) {
    try {
      await forgiveLatestForCharacter(characterId);
    } catch (e) {
      console.warn('[ai-emotion] 主人道歉原谅失败', e);
    }
  }

  return aiEmotion;
}
