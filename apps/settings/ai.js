// ============================================
// settings/ai.js — AI 与接口页面
// 真实功能：默认 API 分组配置（单一真实来源 = api_groups）
// ============================================

import { getApiGroupConfig, setApiGroupConfig } from '../../core/config.js';
import events from '../../core/events.js';
import { ICONS, _esc } from './icons.js';

let _currentPage = null;

function renderAI() {
  const cfg = getApiGroupConfig();
  const hasKey = !!cfg.apiKey;

  return `
    <div class="st-section">
      <div class="st-section-head">
        <div class="st-section-icon">${ICONS.plug}</div>
        <span class="st-section-title">接口配置</span>
      </div>
      <div class="st-capsule-group">
        <div class="st-capsule" style="cursor:default;">
          <div class="st-capsule-icon">${ICONS.plug}</div>
          <div class="st-capsule-body" style="flex:1;">
            <span class="st-capsule-name" style="font-size:0.82rem;">API Base URL</span>
            <input class="st-input" id="st-api-url" type="text" placeholder="https://api.openai.com" value="${_esc(cfg.baseURL)}" autocomplete="off" style="margin-top:4px;"/>
          </div>
        </div>
        <div class="st-capsule" style="cursor:default;">
          <div class="st-capsule-icon">${ICONS.plug}</div>
          <div class="st-capsule-body" style="flex:1;">
            <div class="st-row" style="margin-bottom:4px;">
              <span class="st-capsule-name" style="font-size:0.82rem;">API Key</span>
              <div style="display:flex;align-items:center;gap:6px;">
                <span class="st-key-tag" id="st-key-status">${hasKey ? '已保存' : '未设置'}</span>
                ${hasKey ? '<button class="st-key-clear" id="st-key-clear-btn" type="button">清除</button>' : ''}
                <button class="st-key-clear" id="st-key-toggle-visibility" type="button">显示</button>
              </div>
            </div>
            <input class="st-input st-input-masked" id="st-api-key" type="text" placeholder="粘贴或输入 API Key" value="" autocomplete="off" spellcheck="false" inputmode="text"/>
          </div>
        </div>
        <div class="st-capsule" style="cursor:default;">
          <div class="st-capsule-icon">${ICONS.plug}</div>
          <div class="st-capsule-body" style="flex:1;">
            <span class="st-capsule-name" style="font-size:0.82rem;">模型名</span>
            <input class="st-input" id="st-api-model" type="text" placeholder="gpt-4o" value="${_esc(cfg.model)}" autocomplete="off" spellcheck="false" style="margin-top:4px;"/>
            <button class="st-btn st-btn-ghost" id="st-api-fetch-models" type="button" style="margin-top:8px; width:auto; padding:10px 14px; font-size:0.8rem; min-height:40px;">拉取模型列表</button>
            <div class="st-model-list" id="st-model-list" style="display:none;"></div>
          </div>
        </div>
      </div>
    </div>
    <div style="padding:4px 0 8px; display:flex; flex-direction:column; gap:8px;">
      <button class="st-btn st-btn-primary" id="st-api-save">保存配置</button>
      <button class="st-btn st-btn-ghost" id="st-api-test">测试连接</button>
      <div class="st-status" id="st-api-status"></div>
    </div>
  `;
}

function bindAI(currentPage, root) {
  _currentPage = currentPage;
  const saveBtn = currentPage.querySelector('#st-api-save');
  const testBtn = currentPage.querySelector('#st-api-test');
  const fetchBtn = currentPage.querySelector('#st-api-fetch-models');
  const statusEl = currentPage.querySelector('#st-api-status');
  const urlInput = currentPage.querySelector('#st-api-url');
  const keyInput = currentPage.querySelector('#st-api-key');
  const modelInput = currentPage.querySelector('#st-api-model');
  const keyStatusEl = currentPage.querySelector('#st-key-status');
  const clearBtn = currentPage.querySelector('#st-key-clear-btn');
  const toggleVisibilityBtn = currentPage.querySelector('#st-key-toggle-visibility');
  const modelListEl = currentPage.querySelector('#st-model-list');

  let _clearRequested = false;

  if (toggleVisibilityBtn) {
    toggleVisibilityBtn.addEventListener('click', () => {
      const isMasked = keyInput.classList.contains('st-input-masked');
      keyInput.classList.toggle('st-input-masked', !isMasked);
      toggleVisibilityBtn.textContent = isMasked ? '隐藏' : '显示';
    });
  }

  keyInput.addEventListener('paste', () => {
    requestAnimationFrame(() => { keyInput.value = keyInput.value.trim(); });
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      _clearRequested = !_clearRequested;
      if (_clearRequested) {
        clearBtn.textContent = '已标记';
        clearBtn.classList.add('on');
        keyStatusEl.textContent = '将清除';
        keyInput.value = '';
        keyInput.disabled = true;
        keyInput.placeholder = '保存后清除';
      } else {
        clearBtn.textContent = '清除';
        clearBtn.classList.remove('on');
        keyStatusEl.textContent = '已保存';
        keyInput.disabled = false;
        keyInput.placeholder = '粘贴或输入 API Key';
      }
    });
  }

  function _normalizeBaseURL(raw) {
    return raw.trim().replace(/\/+$/, '');
  }

  function _timeoutSignal(ms) {
    if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
      return AbortSignal.timeout(ms);
    }
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  }

  function _buildEndpoint(baseURL, endpoint) {
    const base = _normalizeBaseURL(baseURL);
    if (base.endsWith(endpoint)) return base;
    return `${base}${endpoint}`;
  }

  function _buildRequestURL(baseURL) {
    return _buildEndpoint(baseURL, '/chat/completions');
  }

  function _buildModelsURL(baseURL) {
    return _buildEndpoint(baseURL, '/models');
  }

  fetchBtn.addEventListener('click', async () => {
    if (fetchBtn.disabled) return;
    fetchBtn.disabled = true;
    fetchBtn.textContent = '拉取中...';
    statusEl.textContent = '';
    statusEl.className = 'st-status';

    const saved = getApiGroupConfig();
    const baseUrl = urlInput.value.trim() || saved.baseURL;
    const apiKey = keyInput.value.trim() || saved.apiKey;

    if (!baseUrl || !apiKey) {
      statusEl.textContent = '先填好地址和密钥哦~';
      statusEl.className = 'st-status err';
      fetchBtn.disabled = false;
      fetchBtn.textContent = '拉取模型列表';
      return;
    }

    const url = _buildModelsURL(baseUrl);

    try {
      const resp = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        signal: _timeoutSignal(10000)
      });

      if (!resp.ok) {
        if (resp.status === 401 || resp.status === 403) {
          statusEl.textContent = '密钥好像不对呢，再检查一下~';
        } else if (resp.status === 404) {
          statusEl.textContent = '这个地址没有模型列表接口，看看 URL 对不对~';
        } else {
          statusEl.textContent = '模型列表没拉取到，检查一下地址或密钥哦';
        }
        statusEl.className = 'st-status err';
        modelListEl.style.display = 'none';
        modelListEl.innerHTML = '';
      } else {
        const data = await resp.json();
        const rawModels = Array.isArray(data?.data) ? data.data : (Array.isArray(data?.models) ? data.models : null);

        if (!rawModels || rawModels.length === 0) {
          statusEl.textContent = '这个接口不像标准 OpenAI 兼容格式，没找到模型列表';
          statusEl.className = 'st-status err';
          modelListEl.style.display = 'none';
          modelListEl.innerHTML = '';
        } else {
          const models = rawModels
            .map(m => typeof m === 'string' ? m : (m?.id || m?.name || ''))
            .filter(Boolean)
            .slice(0, 50);

          modelListEl.innerHTML = models.map(id => `<div class="st-model-chip" data-model="${_esc(id)}">${_esc(id)}</div>`).join('');
          modelListEl.style.display = 'flex';
          statusEl.textContent = `找到 ${models.length} 个模型，点一下就能用~`;
          statusEl.className = 'st-status ok';

          modelListEl.querySelectorAll('.st-model-chip').forEach(chip => {
            chip.addEventListener('click', () => {
              modelListEl.querySelectorAll('.st-model-chip').forEach(c => c.classList.remove('selected'));
              chip.classList.add('selected');
              modelInput.value = chip.dataset.model;
              statusEl.textContent = `已选 ${chip.dataset.model}~`;
              statusEl.className = 'st-status ok';
            });
          });
        }
      }
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        statusEl.textContent = '接口等太久了，可能地址不通~';
      } else {
        statusEl.textContent = '网络连不上，看看地址对不对~';
      }
      statusEl.className = 'st-status err';
      modelListEl.style.display = 'none';
      modelListEl.innerHTML = '';
      console.error('[Settings] 拉取模型失败:', err.name || err.message);
    }

    fetchBtn.disabled = false;
    fetchBtn.textContent = '拉取模型列表';
  });

  testBtn.addEventListener('click', async () => {
    if (testBtn.disabled) return;
    testBtn.disabled = true;
    testBtn.textContent = '测试中...';
    statusEl.textContent = '';
    statusEl.className = 'st-status';

    const saved = getApiGroupConfig();
    const baseUrl = urlInput.value.trim() || saved.baseURL;
    const apiKey = keyInput.value.trim() || saved.apiKey;
    const model = modelInput.value.trim() || saved.model;

    if (!baseUrl || !apiKey || !model) {
      statusEl.textContent = '先填好地址、密钥和模型哦~';
      statusEl.className = 'st-status err';
      testBtn.disabled = false;
      testBtn.textContent = '测试连接';
      return;
    }

    const url = _buildRequestURL(baseUrl);

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1, temperature: 0 }),
        signal: _timeoutSignal(10000)
      });

      if (!resp.ok) {
        if (resp.status === 401 || resp.status === 403) {
          statusEl.textContent = '密钥好像不对呢，再检查一下~';
        } else if (resp.status === 404) {
          statusEl.textContent = '找不到这个地址，看看 URL 对不对~';
        } else {
          statusEl.textContent = '接口没有牵上小手，检查一下地址或密钥哦';
        }
        statusEl.className = 'st-status err';
      } else {
        try {
          const data = await resp.json();
          if (data.error || !data.choices?.[0]?.message) {
            statusEl.textContent = '这个接口不像标准 OpenAI 兼容格式呢';
            statusEl.className = 'st-status err';
          } else {
            statusEl.textContent = '连上啦，小手牵好了~';
            statusEl.className = 'st-status ok';
          }
        } catch {
          statusEl.textContent = '这个接口不像标准 OpenAI 兼容格式呢';
          statusEl.className = 'st-status err';
        }
      }
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        statusEl.textContent = '接口等太久了，可能地址不通~';
      } else {
        statusEl.textContent = '网络连不上，看看地址对不对~';
      }
      statusEl.className = 'st-status err';
      console.error('[Settings] 测试连接失败:', err.name || err.message);
    }

    testBtn.disabled = false;
    testBtn.textContent = '测试连接';
  });

  saveBtn.addEventListener('click', () => {
    const baseUrl = urlInput.value.trim();
    const keyInputValue = keyInput.value.trim();
    const model = modelInput.value.trim();

    const saved = getApiGroupConfig();
    let apiKey;
    if (keyInputValue) apiKey = keyInputValue;
    else if (_clearRequested) apiKey = '';
    else apiKey = saved.apiKey;

    try {
      setApiGroupConfig({ baseURL: baseUrl, apiKey, model });
      _clearRequested = false;

      if (keyStatusEl) {
        keyStatusEl.textContent = apiKey ? '已保存' : '未设置';
      }
      if (clearBtn) {
        clearBtn.textContent = '清除';
        clearBtn.classList.remove('on');
        keyInput.disabled = false;
        keyInput.placeholder = '粘贴或输入 API Key';
      }

      events.emit('settings.changed', { key: 'api', values: { apiBaseUrl: baseUrl, apiModel: model } });
      events.emit('api.changed', { baseUrl, model });

      saveBtn.textContent = '已保存';
      saveBtn.classList.add('saved');
      statusEl.textContent = apiKey ? '配置已保存~' : '已保存（密钥已清除）';
      statusEl.className = 'st-status ok';
      if (!apiKey && clearBtn) clearBtn.style.display = 'none';

      const mainHint = root?.querySelector('#st-entry-ai .st-capsule-hint');
      if (mainHint) mainHint.textContent = baseUrl ? `${baseUrl}${model ? ' · ' + model : ''}` : '未配置';

      setTimeout(() => { saveBtn.textContent = '保存配置'; saveBtn.classList.remove('saved'); }, 1800);
    } catch (err) {
      statusEl.textContent = '保存失败了，再试一次~';
      statusEl.className = 'st-status err';
      console.error('[Settings] 保存失败:', err);
    }
  });
}

export { renderAI, bindAI };
