// ============================================
// ai-spec.js — 各APP AI行为描述加载器
// 从 apps/<app-id>/ai-spec/ 加载每个APP的AI说明书
// 供 ai-context.js 拼装系统提示时使用
// ============================================

import { APPS_REGISTRY } from '../../data/apps-registry.js';

/**
 * 加载所有已注册APP的AI spec
 * 每个APP的spec文件路径：apps/<app-id>/ai-spec/<app-id>-ai-spec.js
 * 导出格式：{ instructions, capabilities, dataAccess, events }
 *
 * @returns {Promise<Map<string, Object>>} appId → spec对象
 */
async function loadAllSpecs() {
  const apps = APPS_REGISTRY;
  const specs = new Map();

  const loadPromises = apps.map(async (app) => {
    try {
      // 动态导入各APP的AI说明书
      const specPath = `../../apps/${app.id}/ai-spec/${app.id}-ai-spec.js`;
      const module = await import(/* @vite-ignore */ specPath);
      const spec = module.default || module.spec || module;
      if (spec && typeof spec === 'object') {
        specs.set(app.id, spec);
      }
    } catch {
      // 该APP还没有AI spec文件，静默跳过
    }
  });

  await Promise.allSettled(loadPromises);
  return specs;
}

/**
 * 获取单个APP的AI spec（从已加载的Map中取）
 */
function getSpec(specsMap, appId) {
  return specsMap.get(appId) || null;
}

/**
 * 将所有已加载的spec拼成一段系统提示文本
 * 供 ai-context.js 注入到消息数组
 */
function buildSystemPrompt(specsMap) {
  const parts = [];

  for (const [appId, spec] of specsMap) {
    if (!spec.instructions) continue;
    parts.push(`【${appId}】${spec.instructions}`);
  }

  return parts.join('\n');
}

export { loadAllSpecs, getSpec, buildSystemPrompt };

