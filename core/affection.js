// core/affection.js
// 角色好感度系统——把"她"对你的印象量化出来，让送礼、转账、聊天这些行为都有累积效果。
// 设计：
//   1) 好感度范围 0-100，默认 30（不冷不热）
//   2) 真源存 IndexedDB STORES.affections；同时缓存到 localStorage（KEYS.characterAffection）方便 UI 快速读
//   3) addAffection 在变化时调用 recordInteraction 把好感度变化记进 AI 长期记忆
//   4) 每次 setAffection / addAffection 都 bus.emit('affection:changed', ...)
//   5) 失败返回旧值不污染数据，UI 不崩
// 依赖：core/storage.js, core/storage-keys.js, core/events.js, core/memory.js, core/util.js

import { STORES, KEYS } from './storage-keys.js';
import { getDB, setDB, getData, setData, getNow } from './storage.js';
import bus from './events.js';
import { recordInteraction } from './memory.js';
import { clamp } from './util.js';

const DEFAULT_AFFECTION = 30;
const MIN_AFFECTION = 0;
const MAX_AFFECTION = 100;

// 等级标签：根据数值返回 {level, label}
const LEVELS = [
  { min: 0,  max: 20,  level: 'cold',     label: '冷淡' },
  { min: 21, max: 40,  level: 'normal',   label: '普通' },
  { min: 41, max: 60,  level: 'friendly', label: '友好' },
  { min: 61, max: 80,  level: 'close',    label: '亲密' },
  { min: 81, max: 100, level: 'beloved',  label: '挚爱' }
];

// ════════════════════════════════════════
// 读取
// ════════════════════════════════════════

/**
 * 读取好感度（0-100），默认 30。
 * 优先读 IndexedDB；IndexedDB 没有时回退 localStorage 缓存；都没有则默认值。
 * @param {string} characterId
 * @returns {Promise<number>}
 */
export async function getAffection(characterId) {
  if (!characterId) return DEFAULT_AFFECTION;
  // 先读 IndexedDB
  try {
    const rec = await getDB(STORES.affections, characterId);
    if (rec && typeof rec.value === 'number') {
      return clamp(rec.value, MIN_AFFECTION, MAX_AFFECTION);
    }
  } catch (e) {
    console.warn('[affection] IndexedDB 读取失败', characterId, e);
  }
  // 回退 localStorage 缓存
  const cached = getData(KEYS.characterAffection(characterId), null);
  if (typeof cached === 'number' && !isNaN(cached)) {
    return clamp(cached, MIN_AFFECTION, MAX_AFFECTION);
  }
  return DEFAULT_AFFECTION;
}

/**
 * 同步读好感度（仅从 localStorage 缓存读，不查 IndexedDB）。
 * UI 渲染需要快速值时用这个；权威值请用 getAffection。
 * @param {string} characterId
 * @returns {number}
 */
export function getAffectionCached(characterId) {
  if (!characterId) return DEFAULT_AFFECTION;
  const cached = getData(KEYS.characterAffection(characterId), null);
  if (typeof cached === 'number' && !isNaN(cached)) {
    return clamp(cached, MIN_AFFECTION, MAX_AFFECTION);
  }
  return DEFAULT_AFFECTION;
}

// ════════════════════════════════════════
// 写入
// ════════════════════════════════════════

/**
 * 设置好感度（绝对值，会被 clamp 到 0-100）。
 * 同时写 IndexedDB + localStorage 缓存，并 emit 'affection:changed'。
 * @param {string} characterId
 * @param {number} value
 * @param {string} [reason] 变化原因（可选，用于事件 payload）
 * @param {number} [delta]  与上一值的差值（可选，用于事件 payload）
 * @returns {Promise<number>} 实际写入的值
 */
export async function setAffection(characterId, value, reason = 'set', delta = 0) {
  if (!characterId) return DEFAULT_AFFECTION;
  const next = clamp(Math.round(Number(value) || 0), MIN_AFFECTION, MAX_AFFECTION);
  const now = getNow();
  // 写 IndexedDB
  try {
    await setDB(STORES.affections, characterId, {
      id: characterId,
      characterId,
      value: next,
      updatedAt: now
    });
  } catch (e) {
    console.warn('[affection] IndexedDB 写入失败', characterId, e);
  }
  // 写 localStorage 缓存
  setData(KEYS.characterAffection(characterId), next);
  // 通知
  try {
    bus.emit('affection:changed', {
      characterId,
      value: next,
      delta,
      reason
    });
  } catch (e) {
    console.warn('[affection] bus.emit 失败', e);
  }
  return next;
}

/**
 * 增减好感度。返回新值。
 * 调用 recordInteraction 把这次变化记进 AI 长期记忆（importance=7，便于 AI 提及）。
 * @param {string} characterId
 * @param {number} delta 正数增加，负数减少
 * @param {string} reason 变化原因（gift / transfer / mood / game / music / chat ...）
 * @returns {Promise<number>} 新值
 */
export async function addAffection(characterId, delta, reason = 'manual') {
  if (!characterId) return DEFAULT_AFFECTION;
  const d = Number(delta) || 0;
  if (d === 0) return await getAffection(characterId);
  const prev = await getAffection(characterId);
  const next = clamp(Math.round(prev + d), MIN_AFFECTION, MAX_AFFECTION);
  const realDelta = next - prev;
  if (realDelta === 0) return next;
  await setAffection(characterId, next, reason, realDelta);
  // 把好感度变化记进长期记忆
  try {
    const direction = realDelta > 0 ? '+' : '';
    await recordInteraction({
      characterId,
      role: 'assistant',
      source: 'affection',
      content: `好感度${direction}${realDelta}（${reason}），现在是${next}（${getAffectionLevel(next).label}）`,
      importance: 7,
      relatedApp: reason || 'affection'
    });
  } catch (e) {
    console.warn('[affection] 记录到记忆失败', e);
  }
  return next;
}

// ════════════════════════════════════════
// 等级 / 展示
// ════════════════════════════════════════

/**
 * 根据数值返回等级标签对象。
 * @param {number} value
 * @returns {{level: string, label: string}}
 */
export function getAffectionLevel(value) {
  const v = clamp(Math.round(Number(value) || 0), MIN_AFFECTION, MAX_AFFECTION);
  const found = LEVELS.find((l) => v >= l.min && v <= l.max);
  return found || LEVELS[0];
}

/**
 * 返回完整展示对象，供 UI 直接渲染。
 * @param {string} characterId
 * @returns {Promise<{value: number, level: string, label: string}>}
 */
export async function getAffectionDisplay(characterId) {
  const value = await getAffection(characterId);
  const { level, label } = getAffectionLevel(value);
  return { value, level, label };
}

// ════════════════════════════════════════
// 监听
// ════════════════════════════════════════

/**
 * 监听好感度变化（bus 的语法糖）。
 * @param {function} handler ({characterId, value, delta, reason}) => void
 * @returns {function} dispose
 */
export function onAffectionChanged(handler) {
  if (typeof handler !== 'function') return () => {};
  return bus.on('affection:changed', handler);
}
