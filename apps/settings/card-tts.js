// apps/settings/card-tts.js
// 我的声音卡——TTS 配置 UI。
// 文案上把 TTS 叫成「我的声音」，免得吓到主人。
// 支持 4 种 provider：浏览器自带 / OpenAI / 硅基流动 / ElevenLabs。
// 功能：选 provider / 配字段 / 试听一句 / 存起来 / 拉取音色列表 / WebSpeech 按语言筛选。
// 依赖：core/tts.js, core/ui.js, core/util.js

import {
  getTTSConfig,
  setTTSConfig,
  playTTS,
  listVoices,
  TTS_PROVIDERS
} from '../../core/tts.js';
import { showToast, createIcon, createCollapsibleCard } from '../../core/ui.js';
import { injectStyle, clamp } from '../../core/util.js';

injectStyle('popo-settings-tts-card', `
  .tts-section-label{
    font-size:var(--font-size-small); color:var(--text-secondary);
    margin:14px 0 6px; font-weight:500;
  }
  .tts-section-label:first-child{ margin-top:0; }
  /* provider 选择按钮组 */
  .tts-providers{
    display:grid; grid-template-columns:repeat(2, 1fr); gap:8px;
    margin-bottom:6px;
  }
  .tts-prov-btn{
    padding:10px 12px; border-radius:var(--radius-md);
    background:color-mix(in srgb, var(--bg-secondary) 60%, transparent);
    border:1px solid color-mix(in srgb, var(--text-hint) 18%, transparent);
    color:var(--text-primary); font-size:var(--font-size-base);
    cursor:pointer; transition:var(--motion);
    display:flex; align-items:center; justify-content:center; gap:6px;
  }
  .tts-prov-btn:active{ transform:scale(var(--press-scale)); }
  .tts-prov-btn.active{
    background:var(--accent); color:var(--bubble-user-text);
    border-color:var(--accent);
    box-shadow:var(--shadow-sm);
  }
  /* 配置字段 */
  .tts-field{ margin-bottom:12px; }
  .tts-field-label{
    display:block; font-size:var(--font-size-small);
    color:var(--text-secondary); margin-bottom:4px;
  }
  .tts-range-row{ display:flex; align-items:center; gap:10px; }
  .tts-range-row input[type=range]{ flex:1; }
  .tts-range-val{
    min-width:36px; text-align:right;
    color:var(--text-secondary); font-size:var(--font-size-small);
  }
  .tts-actions{ display:flex; gap:8px; margin-top:6px; }
  .tts-actions .btn{ flex:1; }
  .tts-hint{
    font-size:var(--font-size-small); color:var(--text-hint);
    line-height:1.5; margin-top:10px;
  }
`);

// provider 选项：id -> 软萌文案
const PROVIDER_OPTIONS = [
  { id: TTS_PROVIDERS.webSpeech,    label: '浏览器自带' },
  { id: TTS_PROVIDERS.openai,       label: 'OpenAI' },
  { id: TTS_PROVIDERS.siliconflow,  label: '硅基流动' },
  { id: TTS_PROVIDERS.elevenlabs,   label: 'ElevenLabs' }
];

// OpenAI 选项
const OPENAI_MODELS = ['tts-1', 'tts-1-hd'];
const OPENAI_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
// 硅基流动模型（示例几个常用的）
const SILICONFLOW_MODELS = [
  'FishAudio/fish-speech-1.5',
  'FunAudioLLM/CosyVoice2-0.5B',
  'FunAudioLLM/CosyVoice2-0.5B:alex'
];

// 试听文案
const PREVIEW_TEXT = '你好呀，我是你的小可爱～';

function escapeAttr(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/** 把 select 的 option 列表拼成 HTML */
function optionsHTML(values, current) {
  return values.map((v) => `<option value="${escapeAttr(v)}" ${v === current ? 'selected' : ''}>${escapeAttr(v)}</option>`).join('');
}

/**
 * 渲染我的声音卡。返回 .card 元素，由 settings/index.js 包到分组里。
 */
export function renderTTSCard() {
  const cfg = getTTSConfig();
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="card-title">我的声音</div>
    <div style="font-size:var(--font-size-small);color:var(--text-hint);margin-bottom:6px;line-height:1.5">
      选个声音给我嘛，配好之后聊天里可以让我念给你听～
    </div>
    <div class="tts-section-label">用哪种声音</div>
    <div class="tts-providers" id="tts-providers"></div>
    <div id="tts-config-area"></div>
    <div class="tts-actions">
      <button class="btn" id="tts-preview" type="button">${createIcon('volume', 18).outerHTML}<span>试听一下</span></button>
      <button class="btn primary" id="tts-save" type="button">${createIcon('check', 18).outerHTML}<span>存起来</span></button>
    </div>
    <div class="tts-hint">没配钥匙也能用「浏览器自带」凑合念哦～</div>
  `;

  // 渲染 provider 按钮组
  const provEl = card.querySelector('#tts-providers');
  PROVIDER_OPTIONS.forEach((p) => {
    const btn = document.createElement('button');
    btn.className = 'tts-prov-btn' + (cfg.provider === p.id ? ' active' : '');
    btn.type = 'button';
    btn.dataset.prov = p.id;
    btn.textContent = p.label;
    btn.addEventListener('click', () => {
      // 切换高亮 + 重渲配置区
      provEl.querySelectorAll('.tts-prov-btn').forEach((b) => b.classList.toggle('active', b.dataset.prov === p.id));
      renderConfigArea(p.id, cfg);
    });
    provEl.appendChild(btn);
  });

  // 配置区
  const areaEl = card.querySelector('#tts-config-area');
  function renderConfigArea(provider, baseCfg) {
    areaEl.innerHTML = '';
    areaEl.appendChild(buildProviderConfig(provider, baseCfg));
  }
  // 初次渲染当前 provider 的配置
  renderConfigArea(cfg.provider, cfg);

  // 收集当前表单值（含 provider）
  const readForm = () => {
    const provider = provEl.querySelector('.tts-prov-btn.active')?.dataset.prov || TTS_PROVIDERS.webSpeech;
    const data = { provider };
    const get = (id) => {
      const el = areaEl.querySelector('#' + id);
      return el ? el.value : '';
    };
    const getNum = (id, fallback) => {
      const el = areaEl.querySelector('#' + id);
      return el ? Number(el.value) : fallback;
    };
    if (provider === TTS_PROVIDERS.webSpeech) {
      data.voice = get('tts-ws-voice');
      data.rate = getNum('tts-ws-rate', 1.0);
      data.pitch = getNum('tts-ws-pitch', 1.0);
      data.volume = getNum('tts-ws-volume', 1.0);
    } else if (provider === TTS_PROVIDERS.openai) {
      data.apiKey = get('tts-oai-key').trim();
      data.model = get('tts-oai-model');
      data.voice = get('tts-oai-voice');
    } else if (provider === TTS_PROVIDERS.siliconflow) {
      data.apiKey = get('tts-sf-key').trim();
      data.model = get('tts-sf-model');
      // 手动填的优先于下拉选择
      const manual = get('tts-sf-voice-manual').trim();
      data.voice = manual || get('tts-sf-voice').trim();
    } else if (provider === TTS_PROVIDERS.elevenlabs) {
      data.apiKey = get('tts-el-key').trim();
      // 手动填的优先于下拉选择
      const manual = get('tts-el-voice-manual').trim();
      data.voice = manual || get('tts-el-voice').trim();
      data.model = get('tts-el-model');
      const stability = getNum('tts-el-stab', 0.5);
      const similarity = getNum('tts-el-sim', 0.75);
      data.voice_settings = { stability, similarity_boost: similarity };
    }
    return data;
  };

  // 试听一下：先存当前配置（playTTS 读的是已存配置），再播放
  card.querySelector('#tts-preview').addEventListener('click', async () => {
    const data = readForm();
    // 简单校验：远程 provider 必须有 apiKey
    if (data.provider !== TTS_PROVIDERS.webSpeech && !data.apiKey) {
      showToast('先把钥匙填上嘛', 'error');
      return;
    }
    setTTSConfig(data);
    const btn = card.querySelector('#tts-preview');
    btn.disabled = true;
    const original = btn.innerHTML;
    btn.innerHTML = createIcon('play', 18).outerHTML + '<span>正在念...</span>';
    try {
      const ctrl = await playTTS(PREVIEW_TEXT);
      if (ctrl && typeof ctrl.onEnd === 'function') {
        ctrl.onEnd = () => {
          btn.disabled = false;
          btn.innerHTML = original;
        };
      } else {
        // 没拿到控制器（空文本等情况），2 秒后恢复
        setTimeout(() => {
          btn.disabled = false;
          btn.innerHTML = original;
        }, 1500);
      }
      showToast('念给你听啦～', 'default', 1200);
    } catch (e) {
      console.warn('[tts] 试听失败', e);
      showToast('念不出来呀，检查一下配置嘛', 'error');
      btn.disabled = false;
      btn.innerHTML = original;
    }
  });

  // 存起来
  card.querySelector('#tts-save').addEventListener('click', () => {
    const data = readForm();
    setTTSConfig(data);
    showToast('声音存好啦', 'success');
  });

  // 离开卡片时如果有正在念的，停掉
  // （卡片被 unmount 时 settings/index.js 会清容器，这里不主动停）

  return card;
}

/**
 * 从远程 provider 拉取可用音色列表。
 * @param {string} provider  provider id
 * @param {string} apiKey    API Key
 * @returns {Promise<Array<{id,name,lang?}>>}
 */
async function fetchRemoteVoices(provider, apiKey) {
  if (provider === TTS_PROVIDERS.elevenlabs) {
    // ElevenLabs: GET /v1/voices
    const res = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': apiKey }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return (json.voices || []).map((v) => ({
      id: v.voice_id,
      name: v.name || v.voice_id,
      lang: (v.labels && v.labels.language) ? v.labels.language : ''
    }));
  }
  if (provider === TTS_PROVIDERS.siliconflow) {
    // 硅基流动: GET /v1/audio/voice/list
    const res = await fetch('https://api.siliconflow.cn/v1/audio/voice/list', {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    // 返回格式可能是 { data: [...] } 或直接数组
    const list = json.data || json.voices || json || [];
    return (Array.isArray(list) ? list : []).map((v) => ({
      id: v.voice_id || v.id || v.uri,
      name: v.name || v.voice_id || v.id,
      lang: v.language || v.lang || ''
    }));
  }
  // OpenAI 的嗓音是固定的 6 个，不提供列表 API，直接返回预设
  if (provider === TTS_PROVIDERS.openai) {
    return OPENAI_VOICES.map((v) => ({ id: v, name: v }));
  }
  return [];
}

/**
 * 根据不同 provider 渲染对应的配置字段 DOM。
 * WebSpeech：语言筛选 + 嗓音下拉 + 语速/音调/音量
 * OpenAI：Key + 型号 + 嗓音下拉（固定 6 个）
 * 硅基流动：Key + 型号 + 嗓音下拉（从 API 拉取）+ 手动输入兜底
 * ElevenLabs：Key + 嗓音下拉（从 API 拉取）+ 型号 + 稳定性/相似度
 */
function buildProviderConfig(provider, cfg) {
  const wrap = document.createElement('div');
  if (provider === TTS_PROVIDERS.webSpeech) {
    // 浏览器自带：语言筛选 + 语音选择 + 语速/音调/音量
    const voices = safeListVoices();
    // 提取所有语言并去重排序
    const langs = [...new Set(voices.map((v) => v.lang).filter(Boolean))].sort();
    const curLangPrefix = (cfg.voice && voices.find((v) => (v.voiceURI || v.name) === cfg.voice)?.lang) || '';
    const curLang = curLangPrefix ? langs.find((l) => l.toLowerCase().startsWith(curLangPrefix.toLowerCase().slice(0, 2))) || '' : '';
    wrap.innerHTML = `
      <div class="tts-field">
        <label class="tts-field-label" for="tts-ws-lang">先选语言</label>
        <select class="select" id="tts-ws-lang">
          <option value="">（全部）</option>
          ${langs.map((l) => `<option value="${escapeAttr(l)}" ${l === curLang ? 'selected' : ''}>${escapeAttr(l)}</option>`).join('')}
        </select>
      </div>
      <div class="tts-field">
        <label class="tts-field-label" for="tts-ws-voice">选个嗓音</label>
        <select class="select" id="tts-ws-voice">
          <option value="">（让小手机自己挑）</option>
          ${voices.map((v) => `<option value="${escapeAttr(v.voiceURI || v.name)}" data-lang="${escapeAttr(v.lang || '')}" ${(cfg.voice === (v.voiceURI || v.name)) ? 'selected' : ''}>${escapeAttr(v.name || v.voiceURI)}${v.lang ? ' (' + escapeAttr(v.lang) + ')' : ''}</option>`).join('')}
        </select>
        ${!voices.length ? '<div style="font-size:var(--font-size-small);color:var(--text-hint);margin-top:4px">还没读到系统嗓音呢，先点试听也能念</div>' : ''}
      </div>
      <div class="tts-field">
        <label class="tts-field-label" for="tts-ws-rate">语速（越快越急）</label>
        <div class="tts-range-row">
          <input type="range" id="tts-ws-rate" min="0.5" max="2" step="0.1" value="${clamp(Number(cfg.rate ?? 1.0), 0.5, 2)}">
          <span class="tts-range-val" id="tts-ws-rate-val">${Number(cfg.rate ?? 1.0).toFixed(1)}</span>
        </div>
      </div>
      <div class="tts-field">
        <label class="tts-field-label" for="tts-ws-pitch">音调（越高越甜）</label>
        <div class="tts-range-row">
          <input type="range" id="tts-ws-pitch" min="0.5" max="2" step="0.1" value="${clamp(Number(cfg.pitch ?? 1.0), 0.5, 2)}">
          <span class="tts-range-val" id="tts-ws-pitch-val">${Number(cfg.pitch ?? 1.0).toFixed(1)}</span>
        </div>
      </div>
      <div class="tts-field">
        <label class="tts-field-label" for="tts-ws-volume">音量</label>
        <div class="tts-range-row">
          <input type="range" id="tts-ws-volume" min="0" max="1" step="0.05" value="${clamp(Number(cfg.volume ?? 1.0), 0, 1)}">
          <span class="tts-range-val" id="tts-ws-volume-val">${Number(cfg.volume ?? 1.0).toFixed(2)}</span>
        </div>
      </div>
    `;
    // 语言筛选联动嗓音下拉
    const langSel = wrap.querySelector('#tts-ws-lang');
    const voiceSel = wrap.querySelector('#tts-ws-voice');
    langSel.addEventListener('change', () => {
      const selLang = langSel.value;
      voiceSel.querySelectorAll('option[data-lang]').forEach((opt) => {
        if (!selLang) {
          opt.style.display = '';
        } else {
          const optLang = opt.dataset.lang || '';
          opt.style.display = optLang.toLowerCase().startsWith(selLang.toLowerCase().slice(0, 2)) ? '' : 'none';
        }
      });
      // 如果当前选中的被隐藏了，重置为默认
      const cur = voiceSel.options[voiceSel.selectedIndex];
      if (cur && cur.style.display === 'none') voiceSel.value = '';
    });
    bindRangeLabels(wrap, [
      { id: 'tts-ws-rate', valId: 'tts-ws-rate-val', fmt: (v) => Number(v).toFixed(1) },
      { id: 'tts-ws-pitch', valId: 'tts-ws-pitch-val', fmt: (v) => Number(v).toFixed(1) },
      { id: 'tts-ws-volume', valId: 'tts-ws-volume-val', fmt: (v) => Number(v).toFixed(2) }
    ]);
  } else if (provider === TTS_PROVIDERS.openai) {
    wrap.innerHTML = `
      <div class="tts-field">
        <label class="tts-field-label" for="tts-oai-key">API Key</label>
        <input class="input" id="tts-oai-key" type="password" placeholder="sk-..." value="${escapeAttr(cfg.apiKey || '')}">
      </div>
      <div class="tts-field">
        <label class="tts-field-label" for="tts-oai-model">型号</label>
        <select class="select" id="tts-oai-model">
          ${optionsHTML(OPENAI_MODELS, cfg.model || 'tts-1')}
        </select>
      </div>
      <div class="tts-field">
        <label class="tts-field-label" for="tts-oai-voice">嗓音（6 种固定音色）</label>
        <select class="select" id="tts-oai-voice">
          ${optionsHTML(OPENAI_VOICES, cfg.voice || 'alloy')}
        </select>
        <div style="font-size:var(--font-size-small);color:var(--text-hint);margin-top:4px">
          alloy=中性 · echo=男声 · fable=叙事 · onyx=深沉男 · nova=女声 · shimmer=轻柔女
        </div>
      </div>
    `;
  } else if (provider === TTS_PROVIDERS.siliconflow) {
    wrap.innerHTML = `
      <div class="tts-field">
        <label class="tts-field-label" for="tts-sf-key">API Key</label>
        <input class="input" id="tts-sf-key" type="password" placeholder="sk-..." value="${escapeAttr(cfg.apiKey || '')}">
      </div>
      <div class="tts-field">
        <label class="tts-field-label" for="tts-sf-model">型号</label>
        <select class="select" id="tts-sf-model">
          ${optionsHTML(SILICONFLOW_MODELS, cfg.model || SILICONFLOW_MODELS[0])}
        </select>
      </div>
      <div class="tts-field">
        <label class="tts-field-label" for="tts-sf-voice">嗓音</label>
        <div class="ai-card-model-row" style="display:flex;gap:6px">
          <select class="select input" id="tts-sf-voice" style="flex:1;min-width:0">
            <option value="">（先点右边拉取，或手动填）</option>
          </select>
          <button class="ai-card-model-btn" id="tts-sf-fetch" type="button" aria-label="拉取音色列表" style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:var(--bg-secondary);border:none;border-radius:var(--radius-sm);color:var(--text-secondary);cursor:pointer">${createIcon('refresh', 18).outerHTML}</button>
        </div>
        <input class="input" id="tts-sf-voice-manual" type="text" placeholder="或者手动填 voice id" value="${escapeAttr(cfg.voice || '')}" style="margin-top:6px">
        <div style="font-size:var(--font-size-small);color:var(--text-hint);margin-top:4px">
          先填 Key 再点刷新拉取音色列表；手动填的会覆盖下拉选择
        </div>
      </div>
    `;
    // 拉取音色按钮
    const fetchBtn = wrap.querySelector('#tts-sf-fetch');
    const voiceSel = wrap.querySelector('#tts-sf-voice');
    fetchBtn.addEventListener('click', async () => {
      const apiKey = wrap.querySelector('#tts-sf-key').value.trim();
      if (!apiKey) { showToast('先填 API Key 嘛', 'error'); return; }
      fetchBtn.disabled = true;
      fetchBtn.classList.add('spinning');
      try {
        const voices = await fetchRemoteVoices(TTS_PROVIDERS.siliconflow, apiKey);
        if (!voices.length) {
          showToast('拉不到音色列表呢，可以手动填', 'error');
          return;
        }
        const cur = voiceSel.value;
        voiceSel.innerHTML = '<option value="">（选一个）</option>' + voices.map((v) =>
          `<option value="${escapeAttr(v.id)}" ${v.id === cur ? 'selected' : ''}>${escapeAttr(v.name)}${v.lang ? ' (' + escapeAttr(v.lang) + ')' : ''}</option>`
        ).join('');
        showToast(`拉到 ${voices.length} 个音色`, 'success');
      } catch (e) {
        showToast('拉不到音色列表：' + (e.message || '网络错误'), 'error');
      } finally {
        fetchBtn.disabled = false;
        fetchBtn.classList.remove('spinning');
      }
    });
    // 预填已有 voice
    if (cfg.voice) {
      const opt = document.createElement('option');
      opt.value = cfg.voice;
      opt.textContent = cfg.voice + '（当前）';
      opt.selected = true;
      voiceSel.appendChild(opt);
    }
  } else if (provider === TTS_PROVIDERS.elevenlabs) {
    const vs = cfg.voice_settings || {};
    wrap.innerHTML = `
      <div class="tts-field">
        <label class="tts-field-label" for="tts-el-key">API Key</label>
        <input class="input" id="tts-el-key" type="password" placeholder="xi-..." value="${escapeAttr(cfg.apiKey || '')}">
      </div>
      <div class="tts-field">
        <label class="tts-field-label" for="tts-el-voice">嗓音</label>
        <div class="ai-card-model-row" style="display:flex;gap:6px">
          <select class="select input" id="tts-el-voice" style="flex:1;min-width:0">
            <option value="">（先点右边拉取，或手动填）</option>
          </select>
          <button class="ai-card-model-btn" id="tts-el-fetch" type="button" aria-label="拉取音色列表" style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:var(--bg-secondary);border:none;border-radius:var(--radius-sm);color:var(--text-secondary);cursor:pointer">${createIcon('refresh', 18).outerHTML}</button>
        </div>
        <input class="input" id="tts-el-voice-manual" type="text" placeholder="或者手动填 voice id" value="${escapeAttr(cfg.voice || '')}" style="margin-top:6px">
      </div>
      <div class="tts-field">
        <label class="tts-field-label" for="tts-el-model">型号</label>
        <select class="select" id="tts-el-model">
          ${optionsHTML(['eleven_multilingual_v2', 'eleven_monolingual_v1', 'eleven_turbo_v2'], cfg.model || 'eleven_multilingual_v2')}
        </select>
      </div>
      <div class="tts-field">
        <label class="tts-field-label" for="tts-el-stab">稳定性</label>
        <div class="tts-range-row">
          <input type="range" id="tts-el-stab" min="0" max="1" step="0.05" value="${clamp(Number(vs.stability ?? 0.5), 0, 1)}">
          <span class="tts-range-val" id="tts-el-stab-val">${Number(vs.stability ?? 0.5).toFixed(2)}</span>
        </div>
      </div>
      <div class="tts-field">
        <label class="tts-field-label" for="tts-el-sim">相似度</label>
        <div class="tts-range-row">
          <input type="range" id="tts-el-sim" min="0" max="1" step="0.05" value="${clamp(Number(vs.similarity_boost ?? 0.75), 0, 1)}">
          <span class="tts-range-val" id="tts-el-sim-val">${Number(vs.similarity_boost ?? 0.75).toFixed(2)}</span>
        </div>
      </div>
    `;
    // 拉取音色按钮
    const fetchBtn = wrap.querySelector('#tts-el-fetch');
    const voiceSel = wrap.querySelector('#tts-el-voice');
    fetchBtn.addEventListener('click', async () => {
      const apiKey = wrap.querySelector('#tts-el-key').value.trim();
      if (!apiKey) { showToast('先填 API Key 嘛', 'error'); return; }
      fetchBtn.disabled = true;
      fetchBtn.classList.add('spinning');
      try {
        const voices = await fetchRemoteVoices(TTS_PROVIDERS.elevenlabs, apiKey);
        if (!voices.length) {
          showToast('拉不到音色列表呢，可以手动填', 'error');
          return;
        }
        const cur = voiceSel.value;
        voiceSel.innerHTML = '<option value="">（选一个）</option>' + voices.map((v) =>
          `<option value="${escapeAttr(v.id)}" ${v.id === cur ? 'selected' : ''}>${escapeAttr(v.name)}${v.lang ? ' (' + escapeAttr(v.lang) + ')' : ''}</option>`
        ).join('');
        showToast(`拉到 ${voices.length} 个音色`, 'success');
      } catch (e) {
        showToast('拉不到音色列表：' + (e.message || '网络错误'), 'error');
      } finally {
        fetchBtn.disabled = false;
        fetchBtn.classList.remove('spinning');
      }
    });
    // 预填已有 voice
    if (cfg.voice) {
      const opt = document.createElement('option');
      opt.value = cfg.voice;
      opt.textContent = cfg.voice + '（当前）';
      opt.selected = true;
      voiceSel.appendChild(opt);
    }
    bindRangeLabels(wrap, [
      { id: 'tts-el-stab', valId: 'tts-el-stab-val', fmt: (v) => Number(v).toFixed(2) },
      { id: 'tts-el-sim', valId: 'tts-el-sim-val', fmt: (v) => Number(v).toFixed(2) }
    ]);
  }
  return wrap;
}

/** 给一组 range 绑定实时回填小数字 */
function bindRangeLabels(root, items) {
  items.forEach((it) => {
    const input = root.querySelector('#' + it.id);
    const val = root.querySelector('#' + it.valId);
    if (!input || !val) return;
    input.addEventListener('input', () => {
      val.textContent = it.fmt(input.value);
    });
  });
}

/** 安全读取系统嗓音列表，避免抛错 */
function safeListVoices() {
  try {
    const v = listVoices();
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return [];
  }
}
