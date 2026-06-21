// core/tts.js
// imports: getData from './storage.js'

import { getData } from './storage.js';

/* ── constants ── */
const TTS_TIMEOUT = 30000;
const MAX_INPUT_LENGTH = 4000;

/* ── active playback tracking ── */
const activeInstances = new Set();

/* ── resolve TTS config: configOverride (角色) > globalTts > error ── */
function resolveConfig(configOverride) {
  const settings = getData('app_settings') || {};
  const globalTts = settings.ttsGlobal || {};
  const override = configOverride || {};

  return {
    endpoint: override.endpoint || globalTts.endpoint || '',
    apiKey: override.apiKey || globalTts.apiKey || '',
    voice: override.voice || 'alloy',
    provider: override.provider || globalTts.provider || 'openai'
  };
}

/* ── normalize endpoint: strip trailing slash and /v1 ── */
function normalizeEndpoint(raw) {
  let url = raw.replace(/\/+$/, '');
  url = url.replace(/\/v1\/?$/, '');
  return url;
}

/* ── toast helper ── */
function toast(msg) {
  if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
    window.showToast(msg);
  }
}

/* ── strip markdown / thinking blocks for cleaner speech ── */
function cleanTextForSpeech(text) {
  return text
    /* remove <thinking>...</thinking> blocks entirely */
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    /* remove code blocks entirely (not spoken) */
    .replace(/```[\s\S]*?```/g, '')
    /* inline code: keep content */
    .replace(/`([^`]+)`/g, '$1')
    /* bold */
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    /* italic */
    .replace(/\*([^*]+)\*/g, '$1')
    /* strikethrough */
    .replace(/~~([^~]+)~~/g, '$1')
    /* headings */
    .replace(/^#{1,6}\s+/gm, '')
    /* image links: remove entirely */
    .replace(/!\[.*?\]\(.*?\)/g, '')
    /* text links: keep label */
    .replace(/\[([^\]]+)\]\(.*?\)/g, '$1')
    /* unordered list markers */
    .replace(/^[-*+]\s+/gm, '')
    /* ordered list markers */
    .replace(/^\d+\.\s+/gm, '')
    /* blockquote markers */
    .replace(/^>\s+/gm, '')
    /* remaining HTML tags: remove tag, keep content */
    .replace(/<[^>]+>/g, '')
    /* collapse excessive newlines */
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Play TTS for given text.
 * Returns a control object { stop() } synchronously.
 * Internally fetches audio and plays it asynchronously.
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

  /* ── empty text guard ── */
  let cleaned = cleanTextForSpeech(text || '');
  if (!cleaned) {
    return instance;
  }

  /* ── truncate to API limit ── */
  if (cleaned.length > MAX_INPUT_LENGTH) {
    cleaned = cleaned.slice(0, MAX_INPUT_LENGTH);
  }

  activeInstances.add(instance);

  /* ── async fetch + play ── */
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

      const baseUrl = normalizeEndpoint(config.endpoint);
      const requestUrl = `${baseUrl}/v1/audio/speech`;

      state.abortController = new AbortController();

      /* ── timeout ── */
      state.timer = setTimeout(() => {
        if (!state.stopped) {
          toast('TTS 请求超时');
          instance.stop();
        }
      }, TTS_TIMEOUT);

      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: 'tts-1',
          voice: config.voice,
          input: cleaned
        }),
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

// depends: getData from ./storage.js (读取 app_settings.ttsGlobal)

