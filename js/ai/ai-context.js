// js/ai/ai-context.js
// 我构建发给 AI 的完整上下文。这是 AI 模块里最核心的文件——
// 我把人设、记忆、世界书、记仇、事件、用户资料、APP 数据（健康/梦境/星座/倒计时）、历史、当前消息按规范顺序拼成 messages。
// 规范要求的顺序见 ai-spec.js 的 CONTEXT_ORDER：
//   system -> persona -> speechStyle -> memory -> worldbook -> grudge -> events -> userProfile
//   -> health -> dreams -> astro -> countdown -> history -> userMessage
// 修复原 bug：原 buildMessages 完全没读 character.personality / speechStyle / background，也没注入记仇本和用户资料。
// 修复：事件上下文统一走 ai-events.js，让 music:playing 等事件映射生效。
// 依赖：./ai-spec.js, ./ai-events.js, ../../core/memory.js, ../../apps/worldbook/match.js,
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
// 事件上下文统一走 ai-events.js（它 re-export 了 inbox.js 的 getRecentEventsPrompt）
// 这样 music:playing / mood:saved / affection:changed 等事件映射才能生效
import { getEventHintsPrompt, getRecentEventsPrompt } from './ai-events.js';
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
  // 主：ai-events.js 的友好文案（覆盖 music:playing / mood:saved / affection:changed 等更多事件）
  // 补：inbox.js 的时间信息（让 AI 知道事件发生的相对时间）
  let eventsPrompt = '';
  try {
    const hints = getEventHintsPrompt(MAX_EVENTS);
    const timed = getRecentEventsPrompt(MAX_EVENTS);
    eventsPrompt = hints && timed ? `${hints}\n${timed}` : (hints || timed);
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

  // 9-12. APP 数据接入：健康打卡 / 最近梦境 / 星座运势 / 倒计时
  // 这些都是 buildContext 异步函数，直接用 getAllDB 读 IndexedDB
  const healthSection = await buildHealthSection();
  if (healthSection) {
    parts.push({ role: 'system', content: healthSection });
  }
  const dreamSection = await buildDreamSection();
  if (dreamSection) {
    parts.push({ role: 'system', content: dreamSection });
  }
  const astroSection = buildAstroSection();
  if (astroSection) {
    parts.push({ role: 'system', content: astroSection });
  }
  const countdownSection = await buildCountdownSection();
  if (countdownSection) {
    parts.push({ role: 'system', content: countdownSection });
  }

  // 13. 对话历史（按 MAX_HISTORY 截断，避免上下文爆炸）
  const trimmedHistory = (history || []).slice(-MAX_HISTORY);
  trimmedHistory.forEach((m) => {
    if (!m || !m.role || !m.content) return;
    parts.push({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content
    });
  });

  // 14. 用户当前消息
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

// ════════════════════════════════════════
// APP 数据接入（健康 / 梦境 / 星座 / 倒计时）
// buildContext 是 async 的，所以这里直接用 getAllDB 读 IndexedDB
// 任一读取失败都返回空串，不影响其他段落
// ════════════════════════════════════════

/** 我把今天的日期格式化成 'YYYY-MM-DD'，和 health App 存的 date 字段对齐 */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 我读今天的健康打卡（STORES.healthEntries），拼成【健康打卡】段落。
 * 字段：water（杯）/ sleep（小时）/ steps（步）/ weight（kg）/ exercises（运动列表）/ note
 * @returns {Promise<string>}
 */
async function buildHealthSection() {
  let entries = [];
  try {
    entries = await getAllDB(STORES.healthEntries);
  } catch (e) {
    return '';
  }
  if (!Array.isArray(entries) || !entries.length) return '';
  const today = todayStr();
  const todayEntry = entries.find((e) => e && e.date === today);
  if (!todayEntry) return '';
  const lines = ['今天的健康打卡：'];
  if (todayEntry.water != null && todayEntry.water !== '') lines.push(`喝了 ${todayEntry.water} 杯水`);
  if (todayEntry.sleep != null && todayEntry.sleep !== '') lines.push(`睡了 ${todayEntry.sleep} 小时`);
  if (todayEntry.steps != null && todayEntry.steps !== '') lines.push(`走了 ${todayEntry.steps} 步`);
  if (todayEntry.weight != null && todayEntry.weight !== '') lines.push(`体重 ${todayEntry.weight} kg`);
  if (Array.isArray(todayEntry.exercises) && todayEntry.exercises.length) {
    const exNames = todayEntry.exercises
      .map((x) => x && (x.name || x.type || ''))
      .filter(Boolean)
      .join('、');
    if (exNames) lines.push(`运动：${exNames}`);
  }
  if (todayEntry.note) lines.push(`备注：${String(todayEntry.note).slice(0, 60)}`);
  // 只有标题没数据就不注入
  if (lines.length <= 1) return '';
  return `${CONTEXT_SECTIONS.HEALTH}\n${lines.join('\n')}`;
}

/**
 * 我读最近 3 条梦境（STORES.dreams），拼成【最近梦境】段落。
 * 字段：content / mood / tags / createdAt
 * @returns {Promise<string>}
 */
async function buildDreamSection() {
  let dreams = [];
  try {
    dreams = await getAllDB(STORES.dreams);
  } catch (e) {
    return '';
  }
  if (!Array.isArray(dreams) || !dreams.length) return '';
  // 按 createdAt 倒序取最近 3 条
  const recent = dreams
    .slice()
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 3);
  const lines = recent
    .map((d) => {
      if (!d) return '';
      const mood = d.mood ? `[${d.mood}]` : '';
      const content = String(d.content || '').slice(0, 100);
      return `${mood}${content}`;
    })
    .filter(Boolean);
  if (!lines.length) return '';
  return `${CONTEXT_SECTIONS.DREAMS}\n最近做的梦：\n${lines.join('\n')}`;
}

/**
 * 我读今日星座运势（KEYS.astroState，localStorage 同步读），拼成【星座运势】段落。
 * 字段：sign / updatedAt
 * @returns {string}
 */
function buildAstroSection() {
  let data = null;
  try {
    data = getData(KEYS.astroState, null);
  } catch (e) {
    return '';
  }
  if (!data || !data.sign) return '';
  return `${CONTEXT_SECTIONS.ASTRO}\n今日星座运势：${data.sign}座`;
}

/**
 * 我读即将到来的倒计时（STORES.countdowns），拼成【倒计时】段落。
 * 字段：title / date（'YYYY-MM-DD'）/ color / repeat / createdAt
 * 注意：countdown App 用的字段是 date，不是 targetDate
 * @returns {Promise<string>}
 */
async function buildCountdownSection() {
  let items = [];
  try {
    items = await getAllDB(STORES.countdowns);
  } catch (e) {
    return '';
  }
  if (!Array.isArray(items) || !items.length) return '';
  const now = Date.now();
  const upcoming = items
    .filter((c) => {
      if (!c || !c.date) return false;
      // date 是 'YYYY-MM-DD'，补上 T00:00:00 避免 ISO 解析时区歧义
      const t = new Date(c.date + 'T00:00:00').getTime();
      return Number.isFinite(t) && t > now;
    })
    .sort((a, b) => new Date(a.date + 'T00:00:00') - new Date(b.date + 'T00:00:00'))
    .slice(0, 3);
  if (!upcoming.length) return '';
  const lines = upcoming.map((c) => {
    const target = new Date(c.date + 'T00:00:00').getTime();
    const days = Math.ceil((target - now) / 86400000);
    return `${c.title}还有${days}天`;
  });
  return `${CONTEXT_SECTIONS.COUNTDOWN}\n即将到来：\n${lines.join('\n')}`;
}
