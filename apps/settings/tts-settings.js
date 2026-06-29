// apps/settings/tts-settings.js
// imports:
//   from '../../core/ui.js': showToast, showBottomSheet, hideBottomSheet, createIcon
//   from '../../core/storage.js': getData, setData, getNow
//   from '../../core/tts.js': playTTS

import { showToast, showBottomSheet, hideBottomSheet, createIcon } from '../../core/ui.js';
import { getData, setData, getNow } from '../../core/storage.js';
import { playTTS } from '../../core/tts.js';

let hostEl = null;
let backHandler = null;
let styleEl = null;
let previewInstance = null;
let testing = false;

const DEFAULT_VOICE = {
  provider: 'openai',
  endpoint: '',
  apiKey: '',
  voice: 'alloy',
  voiceId: '',
  model: 'tts-1',
  modelList: [],
  defaultVoice: 'alloy'
};

const PROVIDER_OPTIONS = [
  ['openai', 'OpenAI / 通用中转'],
  ['elevenlabs', 'ElevenLabs'],
  ['azure', 'Azure TTS'],
  ['custom', '自定义']
];

const OPENAI_VOICES = [
  ['alloy', 'Alloy'],
  ['echo', 'Echo'],
  ['fable', 'Fable'],
  ['onyx', 'Onyx'],
  ['nova', 'Nova'],
  ['shimmer', 'Shimmer']
];

const AZURE_VOICES = [
  ['zh-CN-XiaoxiaoNeural', '晓晓'],
  ['zh-CN-YunxiNeural', '云希'],
  ['zh-CN-YunjianNeural', '云健'],
  ['zh-CN-XiaoyiNeural', '小艺'],
  ['zh-CN-YunxiaNeural', '云夏']
];

export async function mount(containerEl, options = {}) {
  hostEl = containerEl;
  backHandler = typeof options.onBack === 'function' ? options.onBack : null;
  injectStyle();
  await render();
}

export function unmount() {
  stopPreview();
  hideBottomSheet();
  hostEl = null;
  backHandler = null;
}

export async function renderTtsSettings(options = {}) {
  backHandler = typeof options.onBack === 'function' ? options.onBack : backHandler;
  injectStyle();

  const settings = getSettings();
  const tts = settings.ttsGlobal || { ...DEFAULT_VOICE };

  const wrap = page();

  const top = card('TTS 声音屋', '选默认声线、试听、测试接口都在这里');
  top.append(actionRow([
    actionBtn('back', '返回设置', () => goBack()),
    actionBtn('edit', '编辑配置', () => openTtsEditor()),
    actionBtn('play', '试听', () => playPreview())
  ]));
  wrap.append(top);

  const current = card('当前声线', `${providerName(tts.provider)} · ${tts.voice || tts.voiceId || '未选'} · ${tts.model || '未填模型'}`);
  current.append(actionRow([
    actionBtn('refresh', testing ? '测试中' : '测试接口', () => testTts())
  ]));
  wrap.append(current);

  const status = card('接口状态', '');
  const statusText = el('p', 'tts-status-text', '还没测试过');
  status.append(statusText);
  wrap.append(status);

  const voices = card('默认声线', '点一下就能设为默认声线');
  const voiceList = el('div', 'tts-voice-list');

  const allVoices = collectVoices(tts);
  if (!allVoices.length) {
    voiceList.append(el('p', 'settings-note', '还没有可选声线，先去编辑配置里填好接口和模型吧'));
  } else {
    allVoices.forEach((voice) => {
      const chip = voiceChip(voice, voice.id === (tts.defaultVoice || tts.voice), () => {
        setDefaultVoice(voice.id);
        showToast(`默认声线换成 ${voice.name} 啦`);
        rerender();
      });
      voiceList.append(chip);
    });
  }

  voices.append(voiceList);
  wrap.append(voices);

  const preview = card('试听文案', '默认用这一句试听，也可以自己写');
  const previewInput = el('textarea', 'tts-preview-input');
  previewInput.value = getData('tts_preview_text') || '你好呀，声音小屋已经准备好了。';
  previewInput.placeholder = '写一句想让 AI 读的话';
  previewInput.rows = 3;
  previewInput.addEventListener('change', () => {
    setData('tts_preview_text', previewInput.value);
  });
  preview.append(previewInput);
  wrap.append(preview);

  const lastStatus = getData('tts_last_test_status');
  if (lastStatus) {
    statusText.textContent = `上次测试：${formatStatus(lastStatus.status)} · 延迟 ${lastStatus.latencyMs || 0}ms${lastStatus.message ? ' · ' + lastStatus.message : ''}`;
    statusText.className = `tts-status-text tts-status-${lastStatus.status === 'ok' ? 'ok' : 'error'}`;
  }

  return wrap;
}

async function render() {
  if (!hostEl) return;
  hostEl.innerHTML = '';
  hostEl.append(await renderTtsSettings({ onBack: backHandler }));
}

function rerender() {
  if (hostEl) {
    render();
    return;
  }
  window.dispatchEvent(new CustomEvent('settings:refresh'));
}

function goBack() {
  if (backHandler) {
    backHandler();
    return;
  }
  window.dispatchEvent(new CustomEvent('settings:back'));
}

function providerName(provider) {
  const map = {
    openai: 'OpenAI',
    elevenlabs: 'ElevenLabs',
    azure: 'Azure',
    custom: '自定义'
  };
  return map[provider] || provider || '未选择';
}

function collectVoices(tts) {
  const voices = [];

  if (tts.provider === 'openai' || tts.provider === 'custom') {
    OPENAI_VOICES.forEach(([id, name]) => {
      voices.push({ id, name, provider: tts.provider, model: tts.model || 'tts-1' });
    });
  }

  if (tts.provider === 'azure') {
    AZURE_VOICES.forEach(([id, name]) => {
      voices.push({ id, name, provider: 'azure', model: tts.model || '' });
    });
  }

  if (tts.provider === 'elevenlabs') {
    if (tts.voiceId) {
      voices.push({ id: tts.voiceId, name: tts.voiceId, provider: 'elevenlabs', model: tts.model || '' });
    }
    if (tts.voice && tts.voice !== tts.voiceId) {
      voices.push({ id: tts.voice, name: tts.voice, provider: 'elevenlabs', model: tts.model || '' });
    }
  }

  if (Array.isArray(tts.voiceList) && tts.voiceList.length) {
    tts.voiceList.forEach((voice) => {
      const id = typeof voice === 'string' ? voice : voice.id;
      const name = typeof voice === 'string' ? voice : voice.name;
      if (!voices.some((v) => v.id === id)) {
        voices.push({ id, name: name || id, provider: tts.provider, model: tts.model || '' });
      }
    });
  }

  return voices;
}

function voiceChip(voice, active, onClick) {
  const chip = el('button', `tts-voice-chip ${active ? 'active' : ''}`);
  chip.type = 'button';
  chip.append(
    el('strong', '', voice.name),
    el('small', '', `${providerName(voice.provider)} · ${voice.model || '默认模型'}`)
  );
  chip.addEventListener('click', onClick);
  return chip;
}

function playPreview() {
  stopPreview();
  const settings = getSettings();
  const tts = settings.ttsGlobal || { ...DEFAULT_VOICE };
  const text = getData('tts_preview_text') || '你好呀，声音小屋已经准备好了。';
  previewInstance = playTTS(text, tts);
  showToast('开始试听啦');
}

function stopPreview() {
  if (previewInstance?.stop) {
    previewInstance.stop();
  }
  previewInstance = null;
}

async function testTts() {
  if (testing) {
    showToast('正在测试中，等一下哦');
    return;
  }

  testing = true;
  showToast('正在测试 TTS 接口...');

  const startedAt = Date.now();
  const settings = getSettings();
  const tts = settings.ttsGlobal || { ...DEFAULT_VOICE };

  try {
    const result = await testTtsDirect(tts);
    const latencyMs = Date.now() - startedAt;

    setData('tts_last_test_status', {
      status: result.ok ? 'ok' : 'error',
      latencyMs,
      message: result.message || '',
      testedAt: getNow()
    });

    if (result.ok) {
      showToast(`TTS 接口连上啦，延迟 ${latencyMs}ms`);
    } else {
      showToast(`TTS 没连上：${result.message}`);
    }
  } catch (error) {
    setData('tts_last_test_status', {
      status: 'error',
      latencyMs: Date.now() - startedAt,
      message: formatTtsError(error),
      testedAt: getNow()
    });
    showToast(`TTS 没连上：${formatTtsError(error)}`);
  } finally {
    testing = false;
    rerender();
  }
}

async function testTtsDirect(tts) {
  const provider = String(tts.provider || 'openai').toLowerCase();
  const endpoint = String(tts.endpoint || '').trim().replace(/\/+$/, '');
  const apiKey = String(tts.apiKey || '').trim();
  const voice = String(tts.voice || tts.defaultVoice || 'alloy').trim();
  const model = String(tts.model || '').trim();

  if (!endpoint && provider !== 'custom') {
    return { ok: false, message: '还没填接口地址' };
  }

  if (provider === 'custom' && !endpoint) {
    return { ok: false, message: '自定义接口要填地址哦' };
  }

  const url = buildTtsUrl(endpoint, provider, voice);
  const body = buildTtsBody(provider, voice, model);
  const headers = buildTtsHeaders(provider, apiKey);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      cache: 'no-store',
      body: typeof body === 'string' ? body : JSON.stringify(body)
    });

    if (!response.ok) {
      const message = await parseTtsError(response, provider);
      return { ok: false, message };
    }

    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    const isAudio = contentType.startsWith('audio/') || contentType.includes('application/octet-stream');

    if (!isAudio) {
      const text = await response.text().catch(() => '');
      if (text.trim()) {
        return { ok: false, message: '返回格式异常，不是音频' };
      }
    }

    return { ok: true, message: '连接成功' };
  } catch (error) {
    return { ok: false, message: formatTtsError(error) };
  }
}

function buildTtsUrl(endpoint, provider, voiceId) {
  const base = String(endpoint || '').trim().replace(/\/+$/, '');

  if (provider === 'elevenlabs') {
    if (/\/text-to-speech\//i.test(base)) return base;
    if (/\/v1$/i.test(base)) return `${base}/text-to-speech/${encodeURIComponent(voiceId || 'default')}`;
    return `${base}/v1/text-to-speech/${encodeURIComponent(voiceId || 'default')}`;
  }

  if (provider === 'azure') {
    if (/\/cognitiveservices\/v1$/i.test(base)) return base;
    return `${base}/cognitiveservices/v1`;
  }

  if (provider === 'openai' || provider === 'custom') {
    if (/\/audio\/speech$/i.test(base)) return base;
    if (/\/v1$/i.test(base)) return `${base}/audio/speech`;
    return `${base}/v1/audio/speech`;
  }

  return base;
}

function buildTtsBody(provider, voice, model) {
  const text = '你好，声音测试';

  if (provider === 'elevenlabs') {
    return {
      text,
      model_id: model || undefined,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.3,
        use_speaker_boost: true
      }
    };
  }

  if (provider === 'azure') {
    return `<?xml version="1.0" encoding="utf-8"?>
<speak version="1.0" xml:lang="zh-CN" xmlns="http://www.w3.org/2001/10/synthesis">
  <voice name="${voice || 'zh-CN-XiaoxiaoNeural'}">${escapeXml(text)}</voice>
</speak>`;
  }

  return {
    model: model || 'tts-1',
    voice: voice || 'alloy',
    input: text
  };
}

function buildTtsHeaders(provider, apiKey) {
  const headers = { 'Content-Type': 'application/json' };

  if (provider === 'elevenlabs') {
    if (apiKey) headers['xi-api-key'] = apiKey;
    return headers;
  }

  if (provider === 'azure') {
    headers['Content-Type'] = 'application/ssml+xml';
    headers['X-Microsoft-OutputFormat'] = 'audio-16khz-128kbitrate-mono-mp3';
    if (apiKey) headers['Ocp-Apim-Subscription-Key'] = apiKey;
    return headers;
  }

  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

async function parseTtsError(response, provider) {
  try {
    const data = await response.json();
    const detail = data?.error?.message || data?.message || data?.error || '';
    const base = ttsErrorBase(response.status, provider);
    return detail ? `${base}：${detail}` : base;
  } catch {
    return ttsErrorBase(response.status, provider);
  }
}

function ttsErrorBase(status, provider) {
  const label = provider === 'custom' ? 'TTS' : `${provider} TTS`;
  if (status === 401) return `${label} Key 无效或已过期`;
  if (status === 403) return `${label} 没有访问权限`;
  if (status === 404) return `${label} 地址不正确`;
  if (status === 429) return `${label} 请求太频繁`;
  if (status >= 500) return `${label} 服务暂时不可用`;
  return `${label} 请求失败`;
}

function formatTtsError(error) {
  const message = String(error?.message || '').toLowerCase();

  if (error?.name === 'AbortError') return '等太久啦，超时了';
  if (/failed to fetch|load failed|networkerror|cors/.test(message)) {
    return '这个接口被浏览器拦住啦，可能没开放跨域访问';
  }

  return String(error?.message || '').trim() || 'TTS 测试失败';
}

function escapeXml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function openTtsEditor() {
  const settings = getSettings();
  const tts = settings.ttsGlobal || { ...DEFAULT_VOICE };

  let draftModelList = Array.isArray(tts.modelList) ? [...tts.modelList] : [];

  const sheet = sheetBox('编辑声音');

  const provider = selectRow('服务商', tts.provider || 'openai', PROVIDER_OPTIONS);
  const endpoint = inputRow('接口地址', tts.endpoint || '', 'https://api.xxx.com/v1');
  const apiKey = inputRow('API Key', tts.apiKey || '', 'sk-...');
  const voice = inputRow('Voice / 声线', tts.voice || '', 'alloy 或 zh-CN-XiaoxiaoNeural');
  const voiceId = inputRow('Voice ID', tts.voiceId || '', 'ElevenLabs 用');
  const model = inputRow('模型', tts.model || 'tts-1', 'tts-1 / tts-1-hd');

  const modelArea = el('div', 'tts-model-area');

  function renderModels() {
    modelArea.innerHTML = '';
    modelArea.append(modelPicker({
      models: draftModelList,
      current: model.input.value.trim(),
      emptyText: '还没有模型，点拉取模型就会出现',
      onSelect: (value) => {
        model.input.value = value;
        renderModels();
        showToast(`模型抱好啦：${value}`);
      }
    }));
  }

  renderModels();

  sheet.body.append(provider.wrap, endpoint.wrap, apiKey.wrap, voice.wrap, voiceId.wrap, model.wrap, modelArea);

  let loading = false;

  sheet.actions.append(
    actionBtn('refresh', '拉取模型', async () => {
      if (loading) {
        showToast('正在拉取中，等一下哦');
        return;
      }

      const base = endpoint.input.value.trim().replace(/\/+$/, '');
      const key = apiKey.input.value.trim();

      if (!base) {
        showToast('先填接口地址哦');
        return;
      }

      loading = true;
      showToast('正在拉取声音模型...');

      try {
        const response = await fetch(`${base}/v1/models`, {
          headers: key ? { Authorization: `Bearer ${key}` } : {},
          cache: 'no-store'
        });

        if (!response.ok) throw new Error('bad');

        const data = await response.json();
        const models = (data.data || []).map((item) => item.id).filter(Boolean);

        if (!models.length) {
          showToast('没找到模型');
          loading = false;
          return;
        }

        draftModelList = [...new Set(models)];
        renderModels();
        showToast(`拉到 ${draftModelList.length} 个声音模型啦`);
      } catch {
        showToast('声音模型拉取失败');
      } finally {
        loading = false;
      }
    }),

    actionBtn('check', '保存', () => {
      const next = getSettings();
      const newVoice = voice.input.value.trim() || 'alloy';
      next.ttsGlobal = {
        provider: provider.input.value.trim() || 'openai',
        endpoint: endpoint.input.value.trim(),
        apiKey: apiKey.input.value.trim(),
        voice: newVoice,
        voiceId: voiceId.input.value.trim(),
        model: model.input.value.trim() || 'tts-1',
        modelList: draftModelList,
        defaultVoice: newVoice
      };
      saveSettings(next);
      hideBottomSheet();
      showToast('声音配置存好啦');
      rerender();
    })
  );

  showBottomSheet(sheet.root);
}

function setDefaultVoice(voiceId) {
  const settings = getSettings();
  const tts = settings.ttsGlobal || { ...DEFAULT_VOICE };
  settings.ttsGlobal = { ...tts, voice: voiceId, defaultVoice: voiceId };
  saveSettings(settings);
}

function getSettings() {
  const saved = getData('app_settings') || {};
  return {
    ...saved,
    ttsGlobal: { ...DEFAULT_VOICE, ...(saved.ttsGlobal || {}) }
  };
}

function saveSettings(settings) {
  setData('app_settings', settings);
  window.dispatchEvent(new CustomEvent('app-settings-updated'));
}

function page() {
  return el('div', 'tts-settings-page settings-page');
}

function card(title, desc) {
  const node = el('div', 'settings-card');
  node.append(el('div', 'settings-card-title', title));
  if (desc) node.append(el('p', 'settings-card-desc', desc));
  return node;
}

function empty(text) {
  const node = el('div', 'settings-empty');
  node.textContent = text;
  return node;
}

function actionRow(buttons) {
  const row = el('div', 'settings-actions');
  buttons.forEach((btn) => row.append(btn));
  return row;
}

function actionBtn(icon, text, onClick) {
  const btn = el('button', 'settings-action-btn');
  btn.type = 'button';
  btn.append(safeIcon(icon, 17), el('span', '', text));
  btn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick?.(event);
  });
  return btn;
}

function inputRow(label, value, placeholder) {
  const wrap = el('label', 'tts-field');
  const input = el('input', 'tts-input');
  input.type = 'text';
  input.value = value || '';
  input.placeholder = placeholder || '';
  wrap.append(el('span', '', label), input);
  return { wrap, input };
}

function selectRow(label, value, options) {
  const wrap = el('label', 'tts-field');
  const input = el('select', 'tts-input tts-select');

  options.forEach(([val, text]) => {
    const option = document.createElement('option');
    option.value = val;
    option.textContent = text;
    input.append(option);
  });

  input.value = value || options[0]?.[0] || '';
  wrap.append(el('span', '', label), input);
  return { wrap, input };
}

function modelPicker({ models = [], current = '', onSelect, emptyText = '还没有模型' }) {
  const box = el('div', 'tts-model-picker');
  box.append(el('div', 'tts-model-title', '模型小篮子'));

  if (!models.length) {
    box.append(el('p', 'settings-note', emptyText));
    return box;
  }

  const list = el('div', 'tts-model-list');

  models.forEach((model) => {
    const btn = el('button', `tts-model-chip ${model === current ? 'active' : ''}`);
    btn.type = 'button';
    btn.append(el('span', '', model), el('small', '', model === current ? '正在用' : '点我选'));
    btn.addEventListener('click', () => onSelect?.(model));
    list.append(btn);
  });

  box.append(list);
  return box;
}

function sheetBox(title) {
  const root = el('div', 'tts-sheet');
  const body = el('div', 'tts-sheet-body');
  const actions = el('div', 'settings-actions');
  root.append(el('div', 'tts-sheet-title', title), body, actions);
  return { root, body, actions };
}

function safeIcon(name, size = 18) {
  try {
    const icon = createIcon(name, size);
    if (icon) return icon;
  } catch {}

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '12');
  circle.setAttribute('r', '4.5');
  svg.append(circle);

  return svg;
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

function injectStyle() {
  const old = document.getElementById('tts-settings-style');
  if (old) old.remove();

  styleEl = document.createElement('style');
  styleEl.id = 'tts-settings-style';
  styleEl.textContent = `
    .tts-settings-page {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .tts-status-text {
      margin: 6px 0 0;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.55;
      white-space: pre-line;
    }

    .tts-status-ok {
      color: var(--accent-dark);
    }

    .tts-status-error {
      color: var(--text-secondary);
    }

    .tts-voice-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
    }

    .tts-voice-chip {
      min-height: 56px;
      flex: 1 1 calc(50% - 4px);
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      justify-content: center;
      gap: 3px;
      padding: 10px 12px;
      border: none;
      outline: none;
      border-radius: 16px;
      background: var(--surface-muted);
      color: var(--text-primary);
      text-align: left;
      box-shadow: var(--shadow-sm);
      transition: var(--motion);
    }

    .tts-voice-chip:active {
      transform: scale(var(--press-scale));
    }

    .tts-voice-chip.active {
      background: var(--accent-light);
      color: var(--accent-dark);
    }

    .tts-voice-chip strong {
      font-size: var(--font-size-base);
      font-weight: 600;
      line-height: 1.3;
    }

    .tts-voice-chip small {
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.2;
    }

    .tts-voice-chip.active small {
      color: var(--accent);
    }

    .tts-preview-input {
      width: 100%;
      min-height: 80px;
      margin-top: 10px;
      padding: 12px;
      border: none;
      outline: none;
      border-radius: 16px;
      background: var(--surface-muted);
      color: var(--text-primary);
      font-family: var(--font-main);
      font-size: var(--font-size-base);
      line-height: 1.55;
      resize: vertical;
    }

    .tts-field {
      width: 100%;
      min-height: 48px;
      display: flex;
      align-items: stretch;
      flex-direction: column;
      gap: 8px;
      margin-top: 10px;
      padding: 10px 12px;
      border-radius: 16px;
      background: var(--surface-muted);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
    }

    .tts-field span {
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      font-weight: 600;
    }

    .tts-input {
      width: 100%;
      min-height: 44px;
      padding: 10px 12px;
      border: none;
      outline: none;
      border-radius: 15px;
      background: var(--bg-card);
      color: var(--text-primary);
      font-family: var(--font-main);
      font-size: max(var(--font-size-base), 16px);
    }

    .tts-select {
      appearance: none;
      -webkit-appearance: none;
      cursor: pointer;
    }

    .tts-model-picker {
      margin-top: 12px;
      padding: 12px;
      border-radius: 16px;
      background: var(--surface-muted);
      box-shadow: var(--shadow-sm);
    }

    .tts-model-title {
      margin-bottom: 10px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      font-weight: 600;
    }

    .tts-model-list {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding: 2px 2px 8px;
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;
    }

    .tts-model-list::-webkit-scrollbar {
      display: none;
    }

    .tts-model-chip {
      min-width: 148px;
      max-width: 220px;
      min-height: 58px;
      flex: 0 0 auto;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      justify-content: center;
      gap: 3px;
      padding: 10px 12px;
      border: none;
      outline: none;
      border-radius: 16px;
      background: var(--bg-card);
      color: var(--text-primary);
      text-align: left;
      box-shadow: var(--shadow-sm);
      transition: var(--motion);
    }

    .tts-model-chip:active {
      transform: scale(var(--press-scale));
    }

    .tts-model-chip.active {
      background: var(--accent-light);
      color: var(--accent-dark);
    }

    .tts-model-chip span {
      width: 100%;
      overflow: hidden;
      font-size: var(--font-size-small);
      font-weight: 600;
      line-height: 1.3;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .tts-model-chip small {
      color: var(--text-secondary);
      font-size: calc(var(--font-size-small) * 0.86);
      line-height: 1.2;
    }

    .tts-sheet {
      width: min(100%, 460px);
      margin: 0 auto;
      color: var(--text-primary);
    }

    .tts-sheet-title {
      margin-bottom: 12px;
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
    }

    .tts-sheet-body {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    @media (max-width: 520px) {
      .tts-voice-chip {
        flex: 1 1 100%;
      }
    }
  `;
  document.head.appendChild(styleEl);
}
