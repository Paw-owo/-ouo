// js/ai/ai-context.js
// 我构建发给 AI 的完整上下文。这是 AI 模块里最核心的文件——
// 我把人设、记忆、世界书、记仇、事件、用户资料、历史、当前消息按规范顺序拼成 messages。
// 规范要求的 10 步顺序：system -> persona -> memory -> worldbook -> grudge -> events -> userProfile -> history -> userMessage
// 修复原 bug：原 buildMessages 完全没读 character.personality / speechStyle / background，也没注入记仇本和用户资料。
// 依赖：./ai-spec.js, ../../core/memory.js, ../../apps/worldbook/match.js, ../../core/inbox.js,
//       ../../core/config.js, ../../core/storage.js, ../../core/storage-keys.js

import {
  SYSTEM_PROMPT_TEMPLATE,
  CONTEXT_SECTIONS,
  MAX_MEMORY_INJECT,
  MAX_EVENTS,
  MAX_HISTORY
} from './ai-spec.js';
import { buildMemoryPrompt } from '../../core/memory.js';
import { matchWorldbook } from '../../apps/worldbook/match.js';
import { getRecentEventsPrompt } from '../../core/inbox.js';
import { get as getConfig } from '../../core/config.js';
import { getData } from '../../core/storage.js';
import { getAllDB } from '../../core/storage.js';
import { KEYS, STORES } from '../../core/storage-keys.js';

// ════════════════════════════════════════
// 主入口：构建上下文
// ════════════════════════════════════════

/**
 * 我构建发给 AI 的 messages 数组。
 * @param {object} opts { character, history, userText, session }
 *   - character: 角色对象（含 name/persona/personality/speechStyle/background/greeting）
 *   - history: 最近消息数组 [{role, content}]
 *   - userText: 本次用户输入
 *   - session: 当前会话（可选，预留）
 * @returns {Promise<Array<{role, content}>>}
 */
export async function buildContext({ character, history, userText, session } = {}) {
  const parts = [];

  // 1. 系统指令（世界观锚定，第一人称）
  const charName = character?.name || character?.nickname || '我';
  parts.push({ role: 'system', content: SYSTEM_PROMPT_TEMPLATE(charName) });

  // 2-3. 角色人设 + 说话风格（合并到一个 system 段落里）
  const personaSection = buildPersonaSection(character);
  if (personaSection) {
    parts.push({ role: 'system', content: personaSection });
  }

  // 4. 角色记忆（独立段落，不混入人设）
  let memoryPrompt = '';
  try {
    const cid = character?.id || session?.characterId || 'global';
    memoryPrompt = await buildMemoryPrompt(cid, { limit: MAX_MEMORY_INJECT });
  } catch (e) {
    console.warn('[ai-context] 我读记忆失败', e);
  }
  if (memoryPrompt) {
    parts.push({ role: 'system', content: `${CONTEXT_SECTIONS.MEMORY}\n${memoryPrompt}` });
  }

  // 5. 世界书（独立段落，按用户消息匹配触发词条）
  let worldbookEntries = [];
  try {
    const cid = character?.id || session?.characterId || null;
    worldbookEntries = await matchWorldbook(userText || '', cid);
  } catch (e) {
    console.warn('[ai-context] 我匹配世界书失败', e);
  }
  if (Array.isArray(worldbookEntries) && worldbookEntries.length) {
    const wbText = worldbookEntries
      .slice(0, 5)
      .map((e) => e.content || '')
      .filter(Boolean)
      .join('\n');
    if (wbText) {
      parts.push({ role: 'system', content: `${CONTEXT_SECTIONS.WORLDBOOK}\n${wbText}` });
    }
  }

  // 6. 记仇本状态（未原谅的条目，原版完全缺失，补上）
  let grudges = [];
  try {
    const cid = character?.id || session?.characterId || null;
    grudges = await getUnforgivenGrudges(cid);
  } catch (e) {
    console.warn('[ai-context] 我读记仇本失败', e);
  }
  if (grudges.length) {
    const grudgeText = grudges
      .map((g, i) => `${i + 1}. ${g.reason}（${g.note || ''}）`)
      .join('\n');
    parts.push({ role: 'system', content: `${CONTEXT_SECTIONS.GRUDGE}\n${grudgeText}` });
  }

  // 7. 事件中心（小手机世界里最近发生的事）
  let eventsPrompt = '';
  try {
    eventsPrompt = getRecentEventsPrompt(MAX_EVENTS);
  } catch (e) {
    console.warn('[ai-context] 我读事件失败', e);
  }
  if (eventsPrompt) {
    parts.push({ role: 'system', content: `${CONTEXT_SECTIONS.EVENTS}\n${eventsPrompt}` });
  }

  // 8. 用户资料（关于我的主人，原版完全缺失，补上）
  const userProfile = buildUserProfileSection();
  if (userProfile) {
    parts.push({ role: 'system', content: userProfile });
  }

  // 9. 对话历史（按 MAX_HISTORY 截断，避免上下文爆炸）
  const trimmedHistory = (history || []).slice(-MAX_HISTORY);
  trimmedHistory.forEach((m) => {
    if (!m || !m.role || !m.content) return;
    parts.push({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content
    });
  });

  // 10. 用户当前消息
  if (userText) {
    parts.push({ role: 'user', content: userText });
  }

  return parts;
}

// ════════════════════════════════════════
// 辅助函数
// ════════════════════════════════════════

/**
 * 我把角色人设拼成一段 system 消息。
 * 修复原 bug：原 buildMessages 完全没读 character.personality / speechStyle / background。
 * 这里把 name + personality + speechStyle + background + greeting 都注入，缺哪个跳过哪个。
 * 说话风格：优先读 character.speechStyle（角色专属），缺失时回退到全局 AI 配置里的 style。
 * 兼容字段：旧角色只有 persona 没有 personality，我把 persona 也带上不丢内容。
 * @param {object} character
 * @returns {string} 拼好的段落（带【我的人设】标题），空角色返回 ''
 */
function buildPersonaSection(character) {
  if (!character || typeof character !== 'object') return '';
  const lines = [];
  const name = character.name || character.nickname || '';
  if (name) lines.push(`名字：${name}`);
  // 性格：优先 personality，回退 persona（旧字段）
  const personality = character.personality || character.persona || '';
  if (personality) lines.push(`性格：${personality}`);
  // 说话风格：优先角色专属，回退全局配置
  let speechStyle = character.speechStyle || '';
  if (!speechStyle) {
    try {
      const aiCfg = getData(KEYS.aiConfig, null);
      if (aiCfg && aiCfg.style) speechStyle = aiCfg.style;
    } catch (e) {}
  }
  if (speechStyle) lines.push(`说话风格：${speechStyle}`);
  // 背景故事
  const background = character.background || '';
  if (background) lines.push(`背景：${background}`);
  // 开场白（让 AI 知道角色原本是怎么打招呼的）
  const greeting = character.greeting || '';
  if (greeting) lines.push(`开场白：${greeting}`);
  if (!lines.length) return '';
  return `${CONTEXT_SECTIONS.PERSONA}\n${lines.join('\n')}`;
}

/**
 * 我从记仇本里读出某个角色还没被原谅的条目。
 * @param {string} characterId
 * @returns {Promise<Array<{reason, note, level, createdAt}>>} 按时间倒序
 */
async function getUnforgivenGrudges(characterId) {
  if (!characterId) return [];
  let all = [];
  try {
    all = await getAllDB(STORES.grudges);
  } catch (e) {
    console.warn('[ai-context] 我读记仇本失败', e);
    return [];
  }
  if (!Array.isArray(all)) return [];
  return all
    .filter((g) => g && g.characterId === characterId && !g.forgiven)
    .sort((a, b) => {
      const ta = new Date(a.createdAt || 0).getTime();
      const tb = new Date(b.createdAt || 0).getTime();
      return tb - ta;
    });
}

/**
 * 我从 settings 里读主人资料，拼成【关于我的主人】段落。
 * 用户资料存在 KEYS.appSettings 的 userProfile 子对象里（前向兼容：没有就返回空串，不注入）。
 * 字段：userName / userCalled（主人希望被怎么称呼）/ userGender
 * @returns {string} 段落文本，没有资料返回 ''
 */
function buildUserProfileSection() {
  let settings = null;
  try {
    settings = getData(KEYS.appSettings, null);
  } catch (e) {
    return '';
  }
  if (!settings || typeof settings !== 'object') return '';
  const up = settings.userProfile || settings.user_profile || null;
  if (!up || typeof up !== 'object') return '';
  const lines = [];
  if (up.userName) lines.push(`主人的名字：${up.userName}`);
  if (up.userCalled) lines.push(`主人希望被叫：${up.userCalled}`);
  if (up.userGender) lines.push(`主人的性别：${up.userGender}`);
  if (!lines.length) return '';
  return `${CONTEXT_SECTIONS.USER_PROFILE}\n${lines.join('\n')}`;
}
