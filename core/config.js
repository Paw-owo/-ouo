// core/config.js
// 所有"魔法数字"集中管理。每个配置都有默认值，用户可在设置里覆盖。
// 依赖：core/storage.js（懒加载，避免循环）

import { KEYS } from './storage-keys.js';

const DEFAULTS = Object.freeze({
  // 主动消息（chat 用）
  proactiveMessage: {
    enabled: true,
    cooldownMs: 30 * 60 * 1000,        // 用户没回 30 分钟内不重复打扰
    randomMinMs: 5 * 60 * 1000,        // 随机主动消息最早 5 分钟
    randomMaxMs: 10 * 60 * 1000,       // 最晚 10 分钟
    randomChance: 0.35,                // 35% 概率
    dailyBudget: 3,                    // 每日 AI 主动消息上限
    nightSilentEnabled: true,
    nightSilentStart: 22,              // 22:00 起静默
    nightSilentEnd: 8                  // 到 08:00 结束
  },

  // 关系锁与记仇
  relationship: {
    coldWords: ['哦', '嗯', '好吧', '随便', '无所谓', '算了', '不想说', '别烦我'],
    coldThreshold: 3,                  // 累积 3 次冷淡词触发一级
    level1Ms: 30 * 60 * 1000,          // 一级持续 30 分钟
    level2Ms: 2 * 60 * 60 * 1000,      // 二级持续 2 小时
    level3Ms: 6 * 60 * 60 * 1000,      // 三级持续 6 小时
    grudgeDecayMs: 12 * 60 * 60 * 1000 // 记仇自然衰减 12 小时
  },

  // 梦境
  dream: {
    offlineThresholdMs: 5 * 60 * 60 * 1000,  // 离线 5 小时触发
    clearDays: 3,
    hazeDays: 7,
    blurDays: 30
  },

  // 流式与渲染
  stream: {
    throttleMs: 80,                    // 流式渲染 80ms 节流
    chunkBySentence: true
  },

  // 通话
  call: {
    timeoutMs: 30 * 60 * 1000,         // 通话最长 30 分钟自动挂断
    summaryDelayMs: 5_000              // 挂断后 5 秒总结成记忆
  },

  // 上下文与请求
  ai: {
    contextMessageLimit: 20,           // 上下文消息上限
    requestTimeoutMs: 15_000,          // 首源超时 15s
    fallbackTimeoutMs: 60_000,         // 兜底超时 60s
    maxRetries: 2,
    systemPromptMaxChars: 4000
  },

  // 图片
  image: {
    maxSizeMB: 5,                      // 上传上限 5MB
    compressionQuality: 0.78,
    maxWidth: 1280,
    maxHeight: 1280,
    stickerMaxKB: 500                  // 表情包 500KB
  },

  // 存储
  storage: {
    requestTimeoutMs: 8_000,
    transactionTimeoutMs: 12_000
  },

  // 朋友圈
  moments: {
    autoPostChance: 0.30,              // 30% 概率自动发圈
    cooldownMs: 2 * 60 * 60 * 1000,    // 2 小时冷却
    maxImages: 9
  },

  // UI
  ui: {
    toastDurationMs: 2200,
    sheetTransitionMs: 260,
    iconEditPressMs: 620,
    pressScale: 0.96
  },

  // 防打扰预算
  dnd: {
    dailyProactiveBudget: 3,
    minImportanceToNotify: 0.6         // 0-1，重要程度阈值
  },

  // 健康
  health: {
    lateSleepThresholdHour: 1,         // 凌晨 1 点后睡算晚睡
    lateSleepStreakDays: 3,            // 连续 3 天晚睡触发关心
    noWaterDays: 7                     // 7 天没喝水触发小游戏
  },

  // 桌面缩放
  desktop: {
    scaleMin: 0.62,
    scaleMax: 1.28,
    iconSize: 60,
    widgetScaleBase: 1,
    dockBase: 84,
    statusBarBase: 44
  }
});

let cache = null;

function loadUserOverrides() {
  try {
    const raw = localStorage.getItem(KEYS.appConfig);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    console.warn('[config] 用户覆盖读取失败', e);
    return {};
  }
}

function deepMerge(base, override) {
  if (typeof base !== 'object' || base === null) return override !== undefined ? override : base;
  if (typeof override !== 'object' || override === null) return override !== undefined ? override : base;
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const k of Object.keys(override)) {
    out[k] = deepMerge(base[k], override[k]);
  }
  return out;
}

export function getConfig() {
  if (cache) return cache;
  const user = loadUserOverrides();
  cache = deepMerge(DEFAULTS, user);
  return cache;
}

export function get(path, fallback = undefined) {
  const cfg = getConfig();
  const parts = path.split('.');
  let cur = cfg;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in cur) cur = cur[p];
    else return fallback;
  }
  return cur === undefined ? fallback : cur;
}

export function set(path, value) {
  const cfg = getConfig();
  const parts = path.split('.');
  let cur = cfg;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (typeof cur[p] !== 'object' || cur[p] === null) cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
  persist();
}

export function setAll(overrides) {
  cache = deepMerge(DEFAULTS, overrides);
  persist();
}

export function reset() {
  cache = deepMerge(DEFAULTS, {});
  persist();
}

function persist() {
  try {
    // 只保存与默认值不同的部分（轻量），写入独立 key 避免踩到 app_settings
    const user = loadUserOverrides();
    localStorage.setItem(KEYS.appConfig, JSON.stringify({ ...user, ...cache }));
  } catch (e) {
    console.warn('[config] 持久化失败', e);
  }
}

export const DEFAULT_CONFIG = DEFAULTS;
