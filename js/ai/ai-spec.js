// ============================================
// ai-spec.js — 各APP的AI能力描述加载器
// 从 apps-registry 的 aiSpec 字段动态加载各APP的AI说明文件
// 不写死APP列表，不写死联动关系
// 加载后聚合成可注入上下文的结构
// ============================================

import { APPS_REGISTRY } from '../../data/apps-registry.js';

// 已加载的spec缓存：appId → spec对象
const _specCache = new Map();

// 加载失败的spec：appId → true（避免反复重试）
const _failedSpecs = new Set();

// 每个aiSpec文件应导出的标准字段
// 由各APP自己定义，这里只负责加载和聚合
const SPEC_FIELDS = Object.freeze({
  PERSONA:    'persona',      // 第一人称口吻描述
  CAPABILITIES: 'capabilities', // 能做什么（字符串数组）
  EVENT_HOOKS: 'eventHooks',  // 关注哪些事件 → 怎么回应
  CONTEXT_INJECT: 'contextInject', // 额外要注入上下文的说明
  TRIGGERS:   'triggers'      // 触发关键词
});

// 加载单个APP的aiSpec文件
// 成功返回spec对象，失败返回null（不抛错，AI层要能降级）
async function loadAppSpec(appId) {
  if (_specCache.has(appId)) return _specCache.get(appId);
  if (_failedSpecs.has(appId)) return null;

  const appDef = APPS_REGISTRY.find(a => a.id === appId);
  if (!appDef || !appDef.aiSpec) return null;

  try {
    // aiSpec 字段是相对根目录的路径，如 'apps/chat/ai-spec.js'
    const module = await import(/* @vite-ignore */ `/${appDef.aiSpec}`);
    const spec = module.default || module;

    _specCache.set(appId, spec);
    return spec;
  } catch (err) {
    console.warn(`[AI-Spec] 加载 ${appId} 的 aiSpec 失败:`, appDef.aiSpec, err?.message || err);
    _failedSpecs.add(appId);
    return null;
  }
}

// 批量加载所有声明了aiSpec的APP
// 失败的跳过，不影响其他
async function loadAllSpecs() {
  const tasks = APPS_REGISTRY
    .filter(app => app.aiSpec)
    .map(app => loadAppSpec(app.id));

  await Promise.allSettled(tasks);
  return _getLoadedSpecCount();
}

// 获取已加载的spec（不触发加载）
function getSpec(appId) {
  return _specCache.get(appId) || null;
}

// 获取所有已加载spec的appId列表
function getLoadedAppIds() {
  return Array.from(_specCache.keys());
}

function _getLoadedSpecCount() {
  return _specCache.size;
}

// 把已加载的spec聚合成上下文可注入的摘要
// 只包含有persona或capabilities的APP
// options.excludeAppIds: 排除哪些APP
function buildSpecSummary(options = {}) {
  const { excludeAppIds = [] } = options;
  const exclude = new Set(excludeAppIds);

  const summaries = [];

  for (const [appId, spec] of _specCache) {
    if (exclude.has(appId)) continue;

    const appDef = APPS_REGISTRY.find(a => a.id === appId);
    if (!appDef) continue;

    const parts = [];

    if (spec.persona) {
      parts.push(`${spec.persona}`);
    }
    if (Array.isArray(spec.capabilities) && spec.capabilities.length > 0) {
      parts.push(`我能做的事：${spec.capabilities.join('、')}`);
    }
    if (spec.contextInject) {
      parts.push(spec.contextInject);
    }

    if (parts.length > 0) {
      summaries.push(`【${appDef.name}】${parts.join('；')}`);
    }
  }

  return summaries.join('\n');
}

// 获取指定APP的事件钩子配置
// 返回 { event: handler描述 } 或 null
function getEventHooks(appId) {
  const spec = _specCache.get(appId);
  if (!spec || !spec.eventHooks) return null;
  return spec.eventHooks;
}

// 清空缓存（角色切换或重置时用）
function clearSpecCache() {
  _specCache.clear();
  _failedSpecs.clear();
}

export {
  SPEC_FIELDS,
  loadAppSpec,
  loadAllSpecs,
  getSpec,
  getLoadedAppIds,
  buildSpecSummary,
  getEventHooks,
  clearSpecCache
};
