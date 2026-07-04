// apps/settings/card-ai.js
// AI 接口配置卡。我把和 AI 说话的小开关都收在这里啦，
// 配好地址和 Key 之后，聊天就能真正联网回复咯。
// 依赖：core/ai-client.js, core/ui.js, core/util.js, core/config.js

import { getAIConfig, saveAIConfig, isAIConfigured, streamChat } from '../../core/ai-client.js';
import { showToast, createIcon } from '../../core/ui.js';
import { injectStyle, clamp } from '../../core/util.js';
import { get as getConfig, set as setConfig } from '../../core/config.js';

// 我只注入一次样式，重复 import 时 injectStyle 会自动去重
injectStyle('popo-settings-ai-card', `
  .ai-card-field{display:flex;flex-direction:column;gap:6px;margin-bottom:14px}
  .ai-card-field-label{font-size:var(--font-size-small);color:var(--text-secondary)}
  .ai-card-input-wrap{position:relative;display:flex;align-items:center}
  .ai-card-input-wrap .input{flex:1;padding-right:48px}
  .ai-card-eye{position:absolute;right:4px;background:transparent;border:none;color:var(--text-hint);font-size:var(--font-size-small);padding:6px 8px;cursor:pointer;border-radius:var(--radius-sm)}
  .ai-card-eye:active{transform:scale(var(--press-scale))}
  .ai-card-textarea{width:100%;min-height:68px;resize:vertical}
  .ai-card-range-row{display:flex;align-items:center;gap:10px}
  .ai-card-range-row input[type=range]{flex:1}
  .ai-card-range-val{min-width:34px;text-align:right;color:var(--text-secondary);font-size:var(--font-size-small)}
  .ai-card-actions{display:flex;gap:8px;margin-top:6px}
  .ai-card-actions .btn{flex:1}
  .ai-card-hint{font-size:var(--font-size-small);color:var(--text-hint);line-height:1.5;margin-top:10px}
  .ai-card-hint.warn{color:var(--danger)}
  .ai-card-model-row{display:flex;align-items:center;gap:6px}
  .ai-card-model-row .input{flex:1;min-width:0}
  .ai-card-model-row select.input{cursor:pointer}
  .ai-card-model-btn{flex-shrink:0;width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:var(--bg-secondary);border:none;border-radius:var(--radius-sm);color:var(--text-secondary);cursor:pointer;transition:var(--motion)}
  .ai-card-model-btn:active{transform:scale(var(--press-scale))}
  .ai-card-model-btn:disabled{opacity:0.5;cursor:not-allowed}
  .ai-card-model-btn.spinning .popo-icon-svg{animation:popo-ai-spin 0.8s linear infinite}
  @keyframes popo-ai-spin{to{transform:rotate(360deg)}}
`);

// 简单转义，input 的 value 和 textarea 内容都能用
function escapeAttr(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// 从 OpenAI 兼容的 /v1/chat/completions 地址里提取 base URL，再请求 /models 拉模型列表
// baseUrl 可能长这样：https://api.openai.com/v1/chat/completions，要去掉末尾的 /chat/completions
async function fetchModelList(baseUrl, apiKey) {
  const apiBase = baseUrl.replace(/\/chat\/completions\/?$/, '');
  const res = await fetch(`${apiBase}/models`, {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return (json.data || []).map((m) => m.id).filter(Boolean);
}

export function renderAICard() {
  const cfg = getAIConfig();
  const configured = isAIConfigured();
  // 上下文条数走的是 core/config.js 的 ai.contextMessageLimit
  const contextLimit = getConfig('ai.contextMessageLimit', 20);
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="card-title">AI 脑子设置</div>
    ${configured ? '' : '<div class="ai-card-hint warn" id="ai-warn">还没配置 AI 呢，聊天会先用本地回复池凑合一下</div>'}
    <div class="ai-card-field">
      <span class="ai-card-field-label">AI 脑子的地址</span>
      <input class="input" id="ai-url" type="text" placeholder="https://api.openai.com/v1/chat/completions" value="${escapeAttr(cfg.url)}">
    </div>
    <div class="ai-card-field">
      <span class="ai-card-field-label">AI 的钥匙</span>
      <div class="ai-card-input-wrap">
        <input class="input" id="ai-key" type="password" placeholder="sk-..." value="${escapeAttr(cfg.apiKey)}">
        <button class="ai-card-eye" id="ai-eye" type="button" aria-label="切换显示">显示</button>
      </div>
    </div>
    <div class="ai-card-field">
      <span class="ai-card-field-label">AI 的型号</span>
      <div class="ai-card-model-row">
        <input class="input" id="ai-model" type="text" placeholder="gpt-4o-mini" value="${escapeAttr(cfg.model)}">
        <button class="ai-card-model-btn" id="ai-model-fetch" type="button" aria-label="拉取模型列表">${createIcon('refresh', 18).outerHTML}</button>
        <button class="ai-card-model-btn" id="ai-model-manual" type="button" aria-label="切回手动输入" style="display:none">${createIcon('edit', 18).outerHTML}</button>
      </div>
      <span class="ai-card-field-label" style="margin-top:4px">点刷新拉一份模型列表，拉不到也能手动填嘛</span>
    </div>
    <div class="ai-card-field">
      <span class="ai-card-field-label">我的说话方式</span>
      <textarea class="textarea ai-card-textarea" id="ai-style" placeholder="留空就让 TA 跟着人设自然发挥，或写点想要的语气嘛">${escapeAttr(cfg.style)}</textarea>
    </div>
    <div class="card-row">
      <span class="card-row-label">思维链</span>
      <input type="checkbox" id="ai-chain" ${cfg.enableChain ? 'checked' : ''}>
    </div>
    <div class="ai-card-field">
      <span class="ai-card-field-label">我的活泼程度（越高越皮）</span>
      <div class="ai-card-range-row">
        <input type="range" id="ai-temp" min="0" max="1" step="0.1" value="${clamp(Number(cfg.temperature) || 0.8, 0, 1)}">
        <span class="ai-card-range-val" id="ai-temp-val">${(Number(cfg.temperature) || 0.8).toFixed(1)}</span>
      </div>
    </div>
    <div class="ai-card-field">
      <span class="ai-card-field-label">一次最多说多少字</span>
      <div class="ai-card-range-row">
        <input type="range" id="ai-max-tokens" min="100" max="4096" step="100" value="${clamp(Number(cfg.maxTokens) || 800, 100, 4096)}">
        <span class="ai-card-range-val" id="ai-max-tokens-val">${Number(cfg.maxTokens) || 800}</span>
      </div>
    </div>
    <div class="ai-card-field">
      <span class="ai-card-field-label">记得最近几句</span>
      <div class="ai-card-range-row">
        <input type="range" id="ai-ctx-limit" min="4" max="60" step="2" value="${clamp(Number(contextLimit) || 20, 4, 60)}">
        <span class="ai-card-range-val" id="ai-ctx-limit-val">${Number(contextLimit) || 20}</span>
      </div>
    </div>
    <div class="ai-card-actions">
      <button class="btn primary" id="ai-save" type="button">存起来</button>
      <button class="btn" id="ai-test" type="button">试一下嘛</button>
    </div>
  `;

  // 显示 / 隐藏密码小切换
  const eye = card.querySelector('#ai-eye');
  const keyInput = card.querySelector('#ai-key');
  eye.addEventListener('click', () => {
    const hidden = keyInput.type === 'password';
    keyInput.type = hidden ? 'text' : 'password';
    eye.textContent = hidden ? '隐藏' : '显示';
  });

  // 模型拉取 + 手动输入切换
  const fetchBtn = card.querySelector('#ai-model-fetch');
  const manualBtn = card.querySelector('#ai-model-manual');
  const urlInput = card.querySelector('#ai-url');

  // 把当前 #ai-model 节点换成新节点（input <-> select），保留当前值
  const swapModelNode = (newNode) => {
    const cur = card.querySelector('#ai-model');
    const val = cur ? cur.value : '';
    newNode.id = 'ai-model';
    newNode.className = 'input';
    newNode.value = val;
    if (cur) cur.replaceWith(newNode);
  };

  // 点击拉取：读地址和钥匙，请求 /models，成功就换成下拉
  fetchBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    const apiKey = keyInput.value.trim();
    if (!url || !apiKey) {
      showToast('先填好地址和钥匙嘛', 'error');
      return;
    }
    fetchBtn.disabled = true;
    fetchBtn.classList.add('spinning');
    try {
      const models = await fetchModelList(url, apiKey);
      if (!models.length) {
        showToast('拉不到模型列表呢，可以手动输入', 'error');
        return;
      }
      // 换成下拉，当前填的值如果在列表里就选中它
      const curVal = card.querySelector('#ai-model').value;
      const select = document.createElement('select');
      models.forEach((m) => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        if (m === curVal) opt.selected = true;
        select.appendChild(opt);
      });
      swapModelNode(select);
      // 如果当前填的模型不在列表里，就默认选第一个，免得下拉空着
      if (select.selectedIndex < 0 && select.options.length > 0) {
        select.selectedIndex = 0;
      }
      manualBtn.style.display = '';
      showToast('模型列表拉好啦', 'success');
    } catch (e) {
      showToast('拉不到模型列表呢，可以手动输入', 'error');
    } finally {
      fetchBtn.disabled = false;
      fetchBtn.classList.remove('spinning');
    }
  });

  // 切回手动输入：select 换回 input
  manualBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'gpt-4o-mini';
    swapModelNode(input);
    manualBtn.style.display = 'none';
  });

  // 温度滑块实时回填，让小数字跟着动
  const tempInput = card.querySelector('#ai-temp');
  const tempVal = card.querySelector('#ai-temp-val');
  tempInput.addEventListener('input', () => {
    tempVal.textContent = Number(tempInput.value).toFixed(1);
  });

  // 最大 token 数滑块
  const maxTokensInput = card.querySelector('#ai-max-tokens');
  const maxTokensVal = card.querySelector('#ai-max-tokens-val');
  maxTokensInput.addEventListener('input', () => {
    maxTokensVal.textContent = Number(maxTokensInput.value);
  });

  // 上下文条数滑块
  const ctxLimitInput = card.querySelector('#ai-ctx-limit');
  const ctxLimitVal = card.querySelector('#ai-ctx-limit-val');
  ctxLimitInput.addEventListener('input', () => {
    ctxLimitVal.textContent = Number(ctxLimitInput.value);
  });

  // 把表单收成一个小对象
  const readForm = () => ({
    url: card.querySelector('#ai-url').value.trim(),
    apiKey: card.querySelector('#ai-key').value.trim(),
    model: card.querySelector('#ai-model').value.trim() || 'gpt-4o-mini',
    style: card.querySelector('#ai-style').value.trim(),
    enableChain: !!card.querySelector('#ai-chain').checked,
    temperature: Number(card.querySelector('#ai-temp').value),
    maxTokens: Number(card.querySelector('#ai-max-tokens').value),
    contextLimit: Number(card.querySelector('#ai-ctx-limit').value)
  });

  // 根据是否填好，更新顶部提示
  const refreshWarn = (patch) => {
    const has = !!(patch.url && patch.apiKey);
    const existing = card.querySelector('#ai-warn');
    if (has && existing) existing.remove();
    if (!has && !existing) {
      const div = document.createElement('div');
      div.className = 'ai-card-hint warn';
      div.id = 'ai-warn';
      div.textContent = '还没配置 AI，聊天会用本地回复池';
      card.querySelector('.card-title').after(div);
    }
  };

  // 保存配置
  card.querySelector('#ai-save').addEventListener('click', () => {
    const patch = readForm();
    // 上下文条数走的是 config.js，单独存一下
    const { contextLimit, ...aiPatch } = patch;
    setConfig('ai.contextMessageLimit', contextLimit);
    saveAIConfig(aiPatch);
    refreshWarn(patch);
    showToast('AI 配置存好啦', 'success');
  });

  // 测试一下连接：先存再测，因为 streamChat 读的是已存配置
  card.querySelector('#ai-test').addEventListener('click', async () => {
    const patch = readForm();
    if (!patch.url || !patch.apiKey) {
      showToast('先把地址和钥匙填上嘛', 'error');
      return;
    }
    const { contextLimit, ...aiPatch } = patch;
    setConfig('ai.contextMessageLimit', contextLimit);
    saveAIConfig(aiPatch);
    refreshWarn(patch);
    const btn = card.querySelector('#ai-test');
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = '正在试嘛...';
    try {
      const result = await streamChat({
        messages: [
          { role: 'system', content: '你是泡泡，一个软萌的小伙伴。用第一人称回复。' },
          { role: 'user', content: '你好呀，能听见我说话吗？' }
        ]
      });
      if (result.ok) {
        showToast('连上啦，可以聊天咯', 'success');
      } else if (result.reason === 'not_configured') {
        showToast('先把地址和钥匙填上嘛', 'error');
      } else {
        showToast('连不上嘛，检查一下地址和钥匙', 'error');
      }
    } catch (e) {
      showToast('连不上嘛，检查一下地址和钥匙', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  });

  return card;
}
