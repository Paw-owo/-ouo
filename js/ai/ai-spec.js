// ============================================
// ai-spec.js — 各APP AI行为描述加载器
// 维护已加载的 spec 缓存，供 ai-context.js 拼装系统提示时使用
// ============================================

import { APPS_REGISTRY } from '../../data/apps-registry.js';

// appId → spec对象 的内部缓存
const _specs = new Map();

/**
 * 加载单个APP的AI spec
 * 路径：apps/<app-id>/ai-spec/<app-id>-ai-spec.js
 * 导出格式：{ instructions, persona, capabilities, dataAccess, events }
 */
async function loadAppSpec(appId) {
  if (_specs.has(appId)) return _specs.get(appId);

  try {
    const specPath = `../../apps/${appId}/ai-spec/${appId}-ai-spec.js`;
    const module = await import(/* @vite-ignore */ specPath);
    const spec = module.default || module.spec || module;
    if (spec && typeof spec === 'object') {
      _specs.set(appId, spec);
      return spec;
    }
  } catch {
    // 该APP还没有AI spec文件，静默跳过
  }

  _specs.set(appId, null);
  return null;
}

/**
 * 加载所有已注册APP的AI spec
 * 返回 appId → spec对象 的 Map 副本
 */
async function loadAllSpecs() {
  const apps = APPS_REGISTRY;
  await Promise.allSettled(apps.map(app => loadAppSpec(app.id)));
  return new Map(_specs);
}

/**
 * 获取单个APP的AI spec（从已加载的缓存中取）
 */
function getSpec(appId) {
  return _specs.get(appId) || null;
}

/**
 * 将所有已加载的spec拼成一段系统提示文本
 */
function buildSpecSummary() {
  const parts = [];
  for (const [appId, spec] of _specs) {
    if (!spec || !spec.instructions) continue;
    parts.push(`【${appId}】${spec.instructions}`);
  }
  return parts.join('\n');
}

/**
 * 兼容旧命名：buildSystemPrompt = buildSpecSummary
 */
function buildSystemPrompt() {
  return buildSpecSummary();
}

export { loadAllSpecs, loadAppSpec, getSpec, buildSpecSummary, buildSystemPrompt };
