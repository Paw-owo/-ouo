// apps/chat/chat-settings/ai-debug-group.js
// 「AI 调试与互动」分组——说话风格、思维链、温度、最大长度、超时，
// 以及高级参数（top_p / presence_penalty / frequency_penalty），用折叠卡收纳繁琐项。
// 红线：图标只准 SVG 线稿，禁止任何 emoji 字符。
// 依赖：core/ui.js, ./widgets.js

import { createCollapsibleCard, showToast } from '../../core/ui.js';
import {
  makeField, makeInput, makeTextarea, makeToggle, makeSlider, makeButton,
  makeHintBar, makeBadge, makeSection, makeSectionTitle,
  saveChatPrefs, getChatPrefs
} from './widgets.js';

/**
 * 构建「AI 调试与互动」分组。
 * @param {object} ctx
 * @param {object} ctx.character
 * @param {object} ctx.prefs
 * @param {string} ctx.scope 'chat' | 'group'
 * @param {string} [ctx.groupId]
 * @returns {HTMLElement}
 */
export function buildAIDebugGroup(ctx) {
  const { character, prefs, scope = 'chat', groupId } = ctx;
  const ownerId = scope === 'group' ? groupId : character?.id;
  const section = makeSection();
  section.appendChild(makeSectionTitle('AI 调试与互动'));

  if (!ownerId) {
    section.appendChild(makeHintBar('还没有可配置的对象，先选个角色或群吧'));
    return section;
  }

  const ai = (prefs && prefs.aiOverride) || {
    enabled: false, style: '', enableChain: false,
    temperature: 0.8, maxTokens: 800, timeoutMs: 30000,
    topP: null, presencePenalty: null, frequencyPenalty: null
  };

  // 实时读最新 aiOverride
  const curAi = () => {
    const p = getChatPrefs(ownerId);
    return p.aiOverride || ai;
  };
  // 实时读最新 prefs（用于 showThinking 等非 aiOverride 字段）
  const curPrefs = () => getChatPrefs(ownerId);

  const content = document.createElement('div');

  // 说明条
  content.appendChild(makeHintBar(
    ai.enabled
      ? '这些参数只对这个角色/群聊生效'
      : '开启专属 AI 配置后，这些参数才会生效哦',
    ai.enabled ? 'info' : 'warn'
  ));

  // 说话风格
  content.appendChild(makeTextarea({
    label: '说话风格',
    value: ai.style || '',
    placeholder: '比如：温柔、爱撒娇、偶尔毒舌...',
    rows: 2,
    helper: '留空则跟随人设自然发挥；填了会作为额外提示',
    onChange: (v) => {
      saveChatPrefs(ownerId, { aiOverride: { ...curAi(), style: v } });
    }
  }));

  // 思维链开关
  content.appendChild(makeToggle({
    label: '显示思维链',
    value: !!ai.enableChain,
    helper: '开启后 AI 会先输出 ~thinking~ 思考过程，再给最终回复',
    onChange: (v) => {
      saveChatPrefs(ownerId, { aiOverride: { ...curAi(), enableChain: v } });
    }
  }));

  // 温度滑块
  content.appendChild(makeSlider({
    label: '温度（temperature）',
    value: ai.temperature ?? 0.8,
    min: 0, max: 2, step: 0.05,
    helper: '越高越奔放，越低越稳。0.8 左右比较自然',
    format: (v) => v.toFixed(2),
    onChange: (v) => {
      saveChatPrefs(ownerId, { aiOverride: { ...curAi(), temperature: v } });
    }
  }));

  // 最大长度
  content.appendChild(makeSlider({
    label: '最大回复长度（tokens）',
    value: ai.maxTokens ?? 800,
    min: 100, max: 8000, step: 100,
    helper: '太长可能被截断，太短她会说半句',
    format: (v) => String(v),
    onChange: (v) => {
      saveChatPrefs(ownerId, { aiOverride: { ...curAi(), maxTokens: v } });
    }
  }));

  // 超时
  content.appendChild(makeSlider({
    label: '请求超时（秒）',
    value: Math.round((ai.timeoutMs ?? 30000) / 1000),
    min: 5, max: 120, step: 5,
    helper: '网络慢的话调大一点',
    format: (v) => `${v}s`,
    onChange: (v) => {
      saveChatPrefs(ownerId, { aiOverride: { ...curAi(), timeoutMs: v * 1000 } });
    }
  }));

  // ── 高级参数（折叠卡，默认收起）──
  const advancedContent = document.createElement('div');

  advancedContent.appendChild(makeHintBar('这些参数留空表示不传给接口，用服务端默认值', 'info'));

  // top_p
  advancedContent.appendChild(makeSlider({
    label: 'top_p（核采样）',
    value: (ai.topP != null ? ai.topP : 1),
    min: 0, max: 1, step: 0.05,
    helper: '和温度二选一，留 1 表示不传',
    format: (v) => v.toFixed(2),
    onChange: (v) => {
      // 1 视为不传（null）
      saveChatPrefs(ownerId, { aiOverride: { ...curAi(), topP: v >= 1 ? null : v } });
    }
  }));

  // presence_penalty
  advancedContent.appendChild(makeSlider({
    label: 'presence_penalty（话题惩罚）',
    value: (ai.presencePenalty != null ? ai.presencePenalty : 0),
    min: -2, max: 2, step: 0.1,
    helper: '正值鼓励聊新话题，0 表示不传',
    format: (v) => v.toFixed(1),
    onChange: (v) => {
      saveChatPrefs(ownerId, { aiOverride: { ...curAi(), presencePenalty: v === 0 ? null : v } });
    }
  }));

  // frequency_penalty
  advancedContent.appendChild(makeSlider({
    label: 'frequency_penalty（重复惩罚）',
    value: (ai.frequencyPenalty != null ? ai.frequencyPenalty : 0),
    min: -2, max: 2, step: 0.1,
    helper: '正值减少重复，0 表示不传',
    format: (v) => v.toFixed(1),
    onChange: (v) => {
      saveChatPrefs(ownerId, { aiOverride: { ...curAi(), frequencyPenalty: v === 0 ? null : v } });
    }
  }));

  // 重置高级参数
  advancedContent.appendChild(makeButton({
    label: '恢复高级参数默认',
    icon: 'refresh', variant: 'ghost', block: true,
    onClick: () => {
      saveChatPrefs(ownerId, {
        aiOverride: { ...curAi(), topP: null, presencePenalty: null, frequencyPenalty: null }
      });
      showToast('高级参数已重置', 'default', 1200);
    }
  }));

  const advancedCard = createCollapsibleCard('高级参数（可选）', advancedContent, {
    collapsed: true,
    icon: 'sliders',
    subtitle: 'top_p / 重复惩罚 等'
  });
  content.appendChild(advancedCard);

  // ── 调试动作 ──
  const debugRow = document.createElement('div');
  debugRow.className = 'cs-btn-row';
  debugRow.style.marginTop = '8px';
  debugRow.appendChild(makeButton({
    label: '查看当前 AI 上下文', icon: 'memo', variant: 'default',
    onClick: () => showAIContext(ownerId)
  }));
  debugRow.appendChild(makeButton({
    label: '清空对话缓存', icon: 'refresh', variant: 'ghost',
    onClick: () => {
      // 触发事件让 sending.js 失效缓存（如果有的话）
      try {
        const bus = requireBus();
        bus.emit('chat:invalidate-cache', { ownerId, scope });
      } catch (e) {}
      showToast('缓存已清掉啦', 'default', 1200);
    }
  }));
  content.appendChild(debugRow);

  const card = createCollapsibleCard('AI 调试与互动', content, {
    collapsed: true,
    icon: 'sliders',
    subtitle: `温度 ${(ai.temperature ?? 0.8).toFixed(2)} · 长度 ${ai.maxTokens ?? 800}`
  });
  section.appendChild(card);
  return section;
}

// 拉取 events 总线（动态 import 避免循环）
let _bus = null;
function requireBus() {
  if (_bus) return _bus;
  // 同步兜底：直接读全局（events.js 挂在 window 上的情况）
  if (typeof window !== 'undefined' && window.__popoBus) {
    _bus = window.__popoBus;
    return _bus;
  }
  return { emit: () => {} };
}

// 弹出当前 AI 上下文预览（用 promptText 的多行版本展示）
async function showAIContext(ownerId) {
  try {
    const { buildMessages } = await import('../../js/ai/ai-client.js');
    const { getChatPrefs } = await import('./widgets.js');
    const { getDB } = await import('../../core/storage.js');
    const { STORES } = await import('../../core/storage-keys.js');
    // 读角色
    let character = null;
    try { character = await getDB(STORES.characters, ownerId); } catch (e) {}
    // 最近 6 条历史
    let history = [];
    try {
      const { getAllDB } = await import('../../core/storage.js');
      const all = await getAllDB(STORES.messages);
      history = all
        .filter((m) => m.characterId === ownerId)
        .sort((a, b) => new Date(a.timestamp || a.createdAt) - new Date(b.timestamp || b.createdAt))
        .slice(-6)
        .map((m) => ({ role: m.role, content: (m.content || '').slice(0, 80) }));
    } catch (e) {}
    const messages = await buildMessages({
      character,
      history,
      userText: '（预览：这是一条测试消息）',
      memoryPrompt: '',
      recentEvents: ''
    });
    const text = messages.map((m) => `【${m.role}】\n${(m.content || '').slice(0, 300)}`).join('\n\n---\n\n');
    showContextPreview(text);
  } catch (e) {
    console.warn('[chat-settings] 预览上下文失败', e);
    showToast('预览生成失败，再试一下嘛', 'error');
  }
}

function showContextPreview(text) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:20px;';
  const card = document.createElement('div');
  card.style.cssText = 'background:var(--bg-card,#fff);border-radius:16px;width:100%;max-width:480px;max-height:80vh;display:flex;flex-direction:column;overflow:hidden;';
  const header = document.createElement('div');
  header.style.cssText = 'padding:16px 20px;border-bottom:1px solid var(--border-soft,rgba(0,0,0,.06));font-weight:600;';
  header.textContent = '当前 AI 上下文预览';
  card.appendChild(header);
  const body = document.createElement('div');
  body.style.cssText = 'flex:1;overflow-y:auto;padding:16px 20px;font-size:13px;line-height:1.6;white-space:pre-wrap;font-family:ui-monospace,monospace;';
  body.textContent = text || '（空）';
  card.appendChild(body);
  const footer = document.createElement('div');
  footer.style.cssText = 'padding:12px 20px;border-top:1px solid var(--border-soft,rgba(0,0,0,.06));display:flex;justify-content:flex-end;gap:8px;';
  const copyBtn = document.createElement('button');
  copyBtn.className = 'cs-btn';
  copyBtn.textContent = '复制';
  copyBtn.addEventListener('click', () => {
    try {
      navigator.clipboard.writeText(text);
      showToast('复制好啦', 'success', 1200);
    } catch (e) {
      showToast('复制失败，长按选中吧', 'error');
    }
  });
  const closeBtn = document.createElement('button');
  closeBtn.className = 'cs-btn primary';
  closeBtn.textContent = '关闭';
  closeBtn.addEventListener('click', () => overlay.remove());
  footer.appendChild(copyBtn);
  footer.appendChild(closeBtn);
  card.appendChild(footer);
  overlay.appendChild(card);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}
