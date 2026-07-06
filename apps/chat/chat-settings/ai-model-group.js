// apps/chat/chat-settings/ai-model-group.js
// 「AI 模型」分组——为当前角色配置专属 AI 接口（覆盖全局）。
// 含：专属开关 / 接口地址 / API Key / 模型 / 拉取模型列表 / 测试连接。
// 红线：图标只准 SVG 线稿，禁止任何 emoji 字符。
// 依赖：core/storage.js, core/ui.js, ./widgets.js, ../../js/ai/ai-client.js

import { createCollapsibleCard, showToast } from '../../../core/ui.js';
import {
  makeField, makeInput, makeToggle, makeButton, makeAsyncButton,
  makeModelList, makeHintBar, makeBadge, makeSection, makeSectionTitle,
  saveChatPrefs, getChatPrefs, fetchModelList
} from './widgets.js';
import { getAIConfig } from '../../../js/ai/ai-client.js';

/**
 * 构建「AI 模型」分组。
 * @param {object} ctx
 * @param {object} ctx.character 当前角色
 * @param {object} ctx.prefs 当前角色偏好（含 aiOverride）
 * @param {string} ctx.scope 'chat' | 'group'（群聊时 groupId 作为 owner）
 * @param {string} [ctx.groupId] 群聊时传入
 * @returns {HTMLElement}
 */
export function buildAIModelGroup(ctx) {
  const { character, prefs, scope = 'chat', groupId } = ctx;
  const ownerId = scope === 'group' ? groupId : character?.id;
  const section = makeSection();
  section.appendChild(makeSectionTitle('AI 模型与接口'));

  if (!ownerId) {
    section.appendChild(makeHintBar('还没有可配置的对象，先选个角色或群吧'));
    return section;
  }

  const ai = (prefs && prefs.aiOverride) || {
    enabled: false, url: '', apiKey: '', model: ''
  };
  const globalCfg = getAIConfig();

  // 实时读最新 aiOverride（避免闭包里 ai 过期）
  const curAi = () => {
    const p = getChatPrefs(ownerId);
    return p.aiOverride || { enabled: false, url: '', apiKey: '', model: '' };
  };

  const content = document.createElement('div');

  // 提示条
  content.appendChild(makeHintBar(
    ai.enabled
      ? '已开启专属配置，这个角色/群聊会用自己的 AI 接口'
      : '跟随全局 AI 配置，开启后可单独设置接口和模型',
    'info'
  ));

  // 专属开关
  content.appendChild(makeToggle({
    label: '使用专属 AI 配置',
    value: !!ai.enabled,
    helper: '关闭则跟随全局设置里的 AI 配置',
    onChange: (v) => {
      saveChatPrefs(ownerId, { aiOverride: { ...curAi(), enabled: v } });
      rebuild();
      showToast(v ? '专属配置已开启' : '已切回跟随全局', 'default', 1200);
    }
  }));

  // 全局配置预览（专属未开启时显示）
  if (!ai.enabled) {
    const previewBox = document.createElement('div');
    previewBox.className = 'cs-field';
    previewBox.style.cssText = 'opacity:.85;';
    const items = [
      ['接口地址', globalCfg.url ? maskUrl(globalCfg.url) : '（未配置）'],
      ['模型', globalCfg.model || '（未配置）'],
      ['温度', String(globalCfg.temperature ?? 0.8)]
    ];
    previewBox.innerHTML = items.map(([k, v]) =>
      `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:14px;">
        <span style="color:var(--text-tertiary,#8e8e93);">${k}</span>
        <span style="color:var(--text-primary,#1c1c1e);max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeText(v)}</span>
      </div>`
    ).join('');
    content.appendChild(previewBox);
    const card = createCollapsibleCard('AI 模型与接口', content, {
      collapsed: true,
      icon: 'settings',
      subtitle: '跟随全局'
    });
    section.appendChild(card);
    return section;
  }

  // ── 专属配置表单 ──
  // 接口地址
  content.appendChild(makeInput({
    label: '接口地址',
    value: ai.url || '',
    placeholder: 'https://api.openai.com/v1/chat/completions',
    stacked: true,
    helper: 'OpenAI 兼容的 /v1/chat/completions 地址',
    onChange: (v) => {
      saveChatPrefs(ownerId, { aiOverride: { ...curAi(), url: v } });
    }
  }));

  // API Key（密码框）
  content.appendChild(makeInput({
    label: 'API Key',
    value: ai.apiKey || '',
    placeholder: 'sk-...',
    type: 'password',
    stacked: true,
    helper: '只存在本机，不会上传',
    onChange: (v) => {
      saveChatPrefs(ownerId, { aiOverride: { ...curAi(), apiKey: v } });
    }
  }));

  // 模型 + 拉取列表
  const modelWrap = document.createElement('div');
  modelWrap.className = 'cs-field cs-field-stack';
  const modelLabel = document.createElement('div');
  modelLabel.className = 'cs-field-label';
  modelLabel.innerHTML = `<span class="cs-label-title">模型</span>`;
  modelWrap.appendChild(modelLabel);
  const modelInput = document.createElement('input');
  modelInput.className = 'cs-input';
  modelInput.value = ai.model || '';
  modelInput.placeholder = 'gpt-4o-mini / deepseek-chat ...';
  modelInput.spellcheck = false;
  let modelTimer = null;
  modelInput.addEventListener('input', () => {
    if (modelTimer) clearTimeout(modelTimer);
    modelTimer = setTimeout(() => {
      saveChatPrefs(ownerId, { aiOverride: { ...curAi(), model: modelInput.value } });
    }, 300);
  });
  modelWrap.appendChild(modelInput);

  // 拉取按钮 + 列表容器
  const listContainer = document.createElement('div');
  const fetchRow = document.createElement('div');
  fetchRow.style.cssText = 'display:flex;gap:6px;margin-top:6px;';
  const fetchBtn = makeAsyncButton({
    label: '拉取模型列表', icon: 'refresh',
    onClick: async () => {
      const c = curAi();
      if (!c.url) {
        showToast('先填接口地址呀', 'default', 1400);
        return;
      }
      const models = await fetchModelList(c.url, c.apiKey);
      listContainer.innerHTML = '';
      listContainer.appendChild(makeModelList(models, c.model, (m) => {
        modelInput.value = m;
        saveChatPrefs(ownerId, { aiOverride: { ...curAi(), model: m } });
        showToast(`已选 ${m}`, 'success', 1200);
        listContainer.innerHTML = '';
      }));
      showToast(`拉到 ${models.length} 个模型`, 'success', 1200);
    }
  });
  const clearBtn = makeButton({
    label: '收起', variant: 'ghost', icon: 'close',
    onClick: () => { listContainer.innerHTML = ''; }
  });
  fetchRow.appendChild(fetchBtn);
  fetchRow.appendChild(clearBtn);
  modelWrap.appendChild(fetchRow);
  modelWrap.appendChild(listContainer);
  content.appendChild(modelWrap);

  // 测试连接按钮
  content.appendChild(makeAsyncButton({
    label: '测试连接', icon: 'check', block: true,
    onClick: async () => {
      const c = curAi();
      if (!c.url || !c.apiKey) {
        showToast('接口地址和 Key 都要填呀', 'default', 1400);
        return;
      }
      try {
        await fetchModelList(c.url, c.apiKey);
        showToast('连接成功啦，接口可用', 'success', 1400);
      } catch (e) {
        showToast(`连不上：${e.message || '未知错误'}`, 'error', 2000);
      }
    }
  }));

  // 状态徽标
  const badgeRow = document.createElement('div');
  badgeRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;padding:4px 0;';
  badgeRow.appendChild(makeBadge('专属配置', 'success'));
  if (ai.url && ai.apiKey) {
    badgeRow.appendChild(makeBadge('已配置', 'success'));
  } else {
    badgeRow.appendChild(makeBadge('未填完整', 'warn'));
  }
  content.appendChild(badgeRow);

  const card = createCollapsibleCard('AI 模型与接口', content, {
    collapsed: false,
    icon: 'settings',
    subtitle: '专属'
  });
  section.appendChild(card);

  // 重新渲染整个分组（切换 enabled 时调用）
  function rebuild() {
    const parent = section.parentNode;
    if (!parent) return;
    const next = buildAIModelGroup({ character, prefs: getChatPrefs(ownerId), scope, groupId });
    parent.replaceChild(next, section);
  }
  return section;
}

function maskUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}...`;
  } catch (e) {
    return url.slice(0, 24) + '...';
  }
}

function escapeText(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
