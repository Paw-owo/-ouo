// core/tts.js
// imports: getData from './storage.js'

import { getData } from './storage.js';

/* ── constants ── */
const TTS_TIMEOUT = 45000;
const MAX_INPUT_LENGTH = 4000;

/* ── active playback tracking ── */
const activeInstances = new Set();

/* ── resolve TTS config: configOverride (角色) > globalTts > default ── */
function resolveConfig(configOverride = {}) {
  const settings = getData('app_settings') || {};
  const globalTts = settings.ttsGlobal || {};
  const override = configOverride || {};

  const endpoint = pickFirstString(override.endpoint, globalTts.endpoint, '');
  const apiKey = pickFirstString(override.apiKey, globalTts.apiKey, '');
  const voice = pickFirstString(override.voice, globalTts.voice, 'alloy');
  const provider = pickFirstString(override.provider, globalTts.provider, 'openai');
  const model = pickFirstString(override.model, globalTts.model, 'tts-1');

  return {
    endpoint: String(endpoint || '').trim(),
    apiKey: String(apiKey || '').trim(),
    voice: String(voice || '').trim(),
    provider: normalizeProvider(provider, endpoint),
    model: String(model || '').trim()
  };
}

function pickFirstString(...args) {
  for (const arg of args) {
    if (typeof arg === 'string' && arg.trim()) {
      return arg.trim();
    }
  }
  return args[args.length - 1] || '';
}

function normalizeProvider(provider, endpoint) {
  const p = String(provider || '').toLowerCase().trim();
  const ep = String(endpoint || '').toLowerCase();

  if (p === 'minimax' || ep.includes('minimax')) return 'minimax';
  if (p === 'elevenlabs' || ep.includes('elevenlabs')) return 'elevenlabs';
  if (p === 'fish' || ep.includes('fish')) return 'fish';
  if (p === 'volcengine' || ep.includes('volcengine')) return 'volcengine';

  return 'openai';
}

/* ── normalize endpoint: strip trailing slash and /v1 ── */
function normalizeEndpoint(raw) {
  let url = String(raw || '').replace(/\/+$/, '');
  url = url.replace(/\/v1\/?$/, '');
  return url;
}

/* ── toast helper ── */
function toast(message) {
  if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
    window.showToast(message);
  }
}

/* ── strip markdown / thinking blocks for cleaner speech ── */
function cleanTextForSpeech(text) {
  return String(text || '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]+)\]\(.*?\)/g, '$1')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/^>\s+/gm, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* ── build request based on provider ── */
function buildTTSRequest(config, text) {
  if (config.provider === 'minimax') {
    return buildMiniMaxRequest(config, text);
  }

  return buildOpenAIRequest(config, text);
}

function buildOpenAIRequest(config, text) {
  const baseUrl = normalizeEndpoint(config.endpoint);

  return {
    url: `${baseUrl}/v1/audio/speech`,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: {
      model: config.model || 'tts-1',
      voice: config.voice || 'alloy',
      input: text
    }
  };
}

function buildMiniMaxRequest(config, text) {
  const baseUrl = normalizeEndpoint(config.endpoint);
  const model = String(config.model || 'speech-01').toLowerCase().trim();
  const path = isMiniMaxNewModel(model) ? '/v1/t2a_v2' : '/v1/text_to_speech';

  const body = {
    model: model,
    text: text
  };

  if (isMiniMaxNewModel(model)) {
    body.voice_setting = {
      voice_id: config.voice || 'male-qn-qingse',
      speed: 1,
      vol: 1,
      pitch: 0
    };
  } else {
    body.voice_id = config.voice || 'male-qn-qingse';
    body.speed = 1;
    body.vol = 1;
    body.pitch = 0;
  }

  return {
    url: `${baseUrl}${path}`,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body
  };
}

function isMiniMaxNewModel(model) {
  const m = String(model || '').toLowerCase().trim();
  if (!m) return false;
  if (m.includes('speech-2')) return true;
  if (m.includes('speech-02')) return true;
  if (m.includes('t2a')) return true;
  if (m.includes('hd')) return true;
  return false;
}

/**
 * Play TTS for given text.
 * Returns a control object { stop() } synchronously.
 *
 * @param {string} text - Text to speak
 * @param {object} [configOverride] - Character ttsConfig override
 * @returns {{ stop: () => void }}
 */
export function playTTS(text, configOverride) {
  const state = {
    stopped: false,
    audio: null,
    objectUrl: null,
    abortController: null,
    timer: null
  };

  const instance = {
    stop() {
      if (state.stopped) return;
      state.stopped = true;

      if (state.timer) {
        clearTimeout(state.timer);
        state.timer = null;
      }

      if (state.abortController) {
        state.abortController.abort();
      }

      if (state.audio) {
        state.audio.pause();
        state.audio.removeAttribute('src');
        state.audio.load();
      }

      if (state.objectUrl) {
        URL.revokeObjectURL(state.objectUrl);
        state.objectUrl = null;
      }

      activeInstances.delete(instance);
    }
  };

  let cleaned = cleanTextForSpeech(text || '');
  if (!cleaned) {
    return instance;
  }

  if (cleaned.length > MAX_INPUT_LENGTH) {
    cleaned = cleaned.slice(0, MAX_INPUT_LENGTH);
  }

  activeInstances.add(instance);

  (async () => {
    try {
      const config = resolveConfig(configOverride);

      if (!config.endpoint) {
        toast('请先配置 TTS 服务地址');
        activeInstances.delete(instance);
        return;
      }

      if (!config.apiKey) {
        toast('请先配置 TTS API Key');
        activeInstances.delete(instance);
        return;
      }

      if (state.stopped) return;

      const request = buildTTSRequest(config, cleaned);

      state.abortController = new AbortController();

      state.timer = setTimeout(() => {
        if (!state.stopped) {
          toast('TTS 请求超时');
          instance.stop();
        }
      }, TTS_TIMEOUT);

      const response = await fetch(request.url, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify(request.body),
        signal: state.abortController.signal
      });

      if (state.stopped) return;

      if (!response.ok) {
        clearTimeout(state.timer);
        state.timer = null;

        const status = response.status;
        if (status === 401) toast('TTS API Key 无效');
        else if (status === 429) toast('TTS 请求过于频繁');
        else if (status >= 500) toast('TTS 服务暂时不可用');
        else toast(`TTS 请求失败 (${status})`);

        activeInstances.delete(instance);
        return;
      }

      const blob = await response.blob();

      clearTimeout(state.timer);
      state.timer = null;

      if (state.stopped) return;

      if (!blob || blob.size === 0) {
        toast('TTS 返回空音频');
        activeInstances.delete(instance);
        return;
      }

      state.objectUrl = URL.createObjectURL(blob);

      const audio = new Audio();
      state.audio = audio;

      audio.addEventListener('ended', () => {
        if (state.objectUrl) {
          URL.revokeObjectURL(state.objectUrl);
          state.objectUrl = null;
        }
        activeInstances.delete(instance);
      }, { once: true });

      audio.addEventListener('error', () => {
        if (state.objectUrl) {
          URL.revokeObjectURL(state.objectUrl);
          state.objectUrl = null;
        }
        activeInstances.delete(instance);
        toast('音频播放失败');
      }, { once: true });

      audio.src = state.objectUrl;

      await audio.play().catch(() => {
        if (!state.stopped) {
          toast('音频播放被阻止，请点击页面后重试');
        }
        instance.stop();
      });

    } catch (error) {
      if (state.timer) {
        clearTimeout(state.timer);
        state.timer = null;
      }

      if (error.name === 'AbortError') return;

      toast('TTS 服务连接失败');
      activeInstances.delete(instance);
    }
  })();

  return instance;
}

/**
 * Stop all active TTS playback.
 */
export function stopAll() {
  const copies = [...activeInstances];
  for (const inst of copies) {
    inst.stop();
  }
  activeInstances.clear();
}

// 改了什么：修复上一版截断，补全 playTTS 和 stopAll；normalizeEndpoint 去 /v1；MiniMax 新旧模型路径自动区分。
// 会不会影响其他文件：不会，只是增强兼容。
// 更新记忆里该文件的导出函数：playTTS(text, configOverride) / stopAll()
// depends: ./storage.js getData
