// core/tts.js
// imports: getData from './storage.js'

import { getData } from './storage.js';

/* ── constants ── */
const TTS_TIMEOUT = 45000;
const MAX_INPUT_LENGTH = 4000;
const DEFAULT_WEB_SPEECH_LANG = 'zh-CN';
const AZURE_DEFAULT_FORMAT = 'audio-16khz-128kbitrate-mono-mp3';

/* ── active playback tracking ── */
const activeInstances = new Set();

function pickFirstString(...args) {
  for (const arg of args) {
    if (typeof arg === 'string' && arg.trim()) {
      return arg.trim();
    }
  }
  return args[args.length - 1] || '';
}

function normalizeEndpoint(raw) {
  let url = String(raw || '').trim().replace(/\/+$/, '');
  url = url.replace(/\/v1\/?$/, '');
  return url;
}

function normalizeProvider(provider, endpoint) {
  const p = String(provider || '').toLowerCase().trim();
  const ep = String(endpoint || '').toLowerCase();

  if (p === 'openai') return 'openai';
  if (p === 'elevenlabs') return 'elevenlabs';
  if (p === 'azure') return 'azure';
  if (p === 'custom') return 'custom';

  if (ep.includes('elevenlabs')) return 'elevenlabs';
  if (ep.includes('speech.microsoft.com') || ep.includes('tts.speech.microsoft.com') || ep.includes('azure')) return 'azure';
  if (ep.includes('openai')) return 'openai';

  return 'custom';
}

function toast(message) {
  try {
    if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
      window.showToast(message);
    }
  } catch (error) {
    // silent
  }
}

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

function resolveConfig(configOverride = {}) {
  const settings = getData('app_settings') || {};
  const globalTts = settings.ttsGlobal || {};
  const override = configOverride || {};

  const endpoint = pickFirstString(override.endpoint, globalTts.endpoint, '');
  const apiKey = pickFirstString(override.apiKey, globalTts.apiKey, '');
  const voice = pickFirstString(override.voice, globalTts.voice, '');
  const provider = pickFirstString(override.provider, globalTts.provider, 'custom');
  const model = pickFirstString(override.model, globalTts.model, '');
  const language = pickFirstString(override.language, globalTts.language, DEFAULT_WEB_SPEECH_LANG);

  const normalizedEndpoint = normalizeEndpoint(endpoint);

  return {
    endpoint: normalizedEndpoint,
    apiKey: String(apiKey || '').trim(),
    voice: String(voice || '').trim(),
    provider: normalizeProvider(provider, normalizedEndpoint),
    model: String(model || '').trim(),
    language: String(language || '').trim() || DEFAULT_WEB_SPEECH_LANG
  };
}

function createInstance() {
  const state = {
    stopped: false,
    audio: null,
    objectUrl: null,
    abortController: null,
    timer: null,
    utterance: null
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
        state.abortController = null;
      }

      if (state.audio) {
        try {
          state.audio.pause();
          state.audio.removeAttribute('src');
          state.audio.load();
        } catch (error) {
          // silent
        }
        state.audio = null;
      }

      if (state.utterance && typeof window !== 'undefined' && window.speechSynthesis) {
        try {
          window.speechSynthesis.cancel();
        } catch (error) {
          // silent
        }
        state.utterance = null;
      }

      if (state.objectUrl) {
        try {
          URL.revokeObjectURL(state.objectUrl);
        } catch (error) {
          // silent
        }
        state.objectUrl = null;
      }

      activeInstances.delete(instance);
    }
  };

  return { instance, state };
}

function canUseWebSpeech() {
  return typeof window !== 'undefined'
    && 'speechSynthesis' in window
    && typeof window.SpeechSynthesisUtterance !== 'undefined';
}

function speakWithWebSpeech(text, config, state, instance) {
  if (!canUseWebSpeech()) return false;

  try {
    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.lang = config.language || DEFAULT_WEB_SPEECH_LANG;

    if (config.voice && window.speechSynthesis.getVoices) {
      const voices = window.speechSynthesis.getVoices() || [];
      const matched = voices.find((voice) =>
        String(voice.name || '').toLowerCase() === String(config.voice || '').toLowerCase() ||
        String(voice.voiceURI || '').toLowerCase() === String(config.voice || '').toLowerCase()
      );
      if (matched) utterance.voice = matched;
    }

    utterance.onend = () => {
      activeInstances.delete(instance);
      state.utterance = null;
    };

    utterance.onerror = () => {
      activeInstances.delete(instance);
      state.utterance = null;
    };

    state.utterance = utterance;
    window.speechSynthesis.speak(utterance);
    return true;
  } catch (error) {
    return false;
  }
}

function buildOpenAIRequest(config, text) {
  const baseUrl = normalizeEndpoint(config.endpoint);

  return {
    url: `${baseUrl}/v1/audio/speech`,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`
    },
    body: {
      model: config.model || 'tts-1',
      voice: config.voice || 'alloy',
      input: text
    }
  };
}

function buildCustomRequest(config, text) {
  const baseUrl = normalizeEndpoint(config.endpoint);
  const url = `${baseUrl}/v1/audio/speech`;

  return {
    url,
    headers: {
      'Content-Type': 'application/json'
    },
    body: {
      model: config.model || 'tts-1',
      voice: config.voice || 'alloy',
      input: text
    }
  };
}

function buildElevenLabsRequest(config, text) {
  const baseUrl = normalizeEndpoint(config.endpoint);
  const voiceId = config.voice || 'default';

  return {
    url: `${baseUrl}/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': config.apiKey
    },
    body: {
      text,
      model_id: config.model || undefined,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.3,
        use_speaker_boost: true
      }
    }
  };
}

function escapeXml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildAzureSsml(text, config) {
  const voice = config.voice || 'zh-CN-XiaoxiaoNeural';
  const lang = config.language || DEFAULT_WEB_SPEECH_LANG;
  return `<?xml version="1.0" encoding="utf-8"?>
<speak version="1.0" xml:lang="${lang}" xmlns="http://www.w3.org/2001/10/synthesis">
  <voice name="${voice}">${escapeXml(text)}</voice>
</speak>`;
}

function buildAzureRequest(config, text) {
  const baseUrl = normalizeEndpoint(config.endpoint);
  const url = baseUrl.includes('/cognitiveservices/v1')
    ? baseUrl
    : `${baseUrl}/cognitiveservices/v1`;

  return {
    url,
    headers: {
      'Content-Type': 'application/ssml+xml',
      'Ocp-Apim-Subscription-Key': config.apiKey,
      'X-Microsoft-OutputFormat': AZURE_DEFAULT_FORMAT
    },
    body: buildAzureSsml(text, config)
  };
}

function buildTTSRequest(config, text) {
  if (config.provider === 'elevenlabs') return buildElevenLabsRequest(config, text);
  if (config.provider === 'azure') return buildAzureRequest(config, text);
  if (config.provider === 'openai') return buildOpenAIRequest(config, text);
  return buildCustomRequest(config, text);
}

function parseRemoteError(status, provider) {
  const label = provider === 'custom' ? 'TTS' : `${provider} TTS`;
  if (status === 401) return `${label} API Key 无效或已过期`;
  if (status === 403) return `${label} 没有访问权限`;
  if (status === 404) return `${label} 地址不正确`;
  if (status === 429) return `${label} 请求太频繁，请稍后再试`;
  if (status >= 500) return `${label} 服务暂时不可用`;
  return `${label} 请求失败 (${status})`;
}

function canUseResponseAudio(response) {
  const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
  return contentType.startsWith('audio/') || contentType.includes('application/octet-stream') || contentType.includes('binary');
}

async function tryPlayBlob(blob, state, instance) {
  if (!blob || blob.size === 0) return false;

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
  }, { once: true });

  audio.src = state.objectUrl;
  await audio.play();
  return true;
}

async function playRemoteTTS(config, text, state, instance) {
  const request = buildTTSRequest(config, text);

  if ((config.provider === 'azure' || config.provider === 'openai' || config.provider === 'custom') && !config.endpoint) {
    return false;
  }

  const response = await fetch(request.url, {
    method: 'POST',
    headers: request.headers,
    body: request.body,
    signal: state.abortController.signal
  });

  if (state.stopped) return true;

  if (!response.ok) {
    toast(parseRemoteError(response.status, config.provider));
    return false;
  }

  const blob = await response.blob();
  if (state.stopped) return true;

  if (!canUseResponseAudio(response) && !(blob && blob.size > 0)) {
    return false;
  }

  return await tryPlayBlob(blob, state, instance);
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
  const { instance, state } = createInstance();

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
      const hasWebSpeech = canUseWebSpeech();
      const hasRemote = Boolean(config.endpoint || config.apiKey);

      if (!hasRemote) {
        if (hasWebSpeech) {
          speakWithWebSpeech(cleaned, config, state, instance);
        } else {
          activeInstances.delete(instance);
        }
        return;
      }

      state.abortController = new AbortController();
      state.timer = setTimeout(() => {
        instance.stop();
      }, TTS_TIMEOUT);

      const played = await playRemoteTTS(config, cleaned, state, instance);

      if (state.stopped) return;

      if (!played && hasWebSpeech) {
        speakWithWebSpeech(cleaned, config, state, instance);
      } else if (!played) {
        activeInstances.delete(instance);
      }

      if (state.timer) {
        clearTimeout(state.timer);
        state.timer = null;
      }
    } catch (error) {
      if (state.timer) {
        clearTimeout(state.timer);
        state.timer = null;
      }

      if (error?.name === 'AbortError') return;

      if (canUseWebSpeech()) {
        speakWithWebSpeech(cleaned, resolveConfig(configOverride), state, instance);
        return;
      }

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

// 改了什么：
// 1. 按 provider 自动分流到 openai / elevenlabs / azure / custom。
// 2. custom 默认按 OpenAI-compatible TTS 发送，便于中转服务接入。
// 3. Azure 使用标准 SSML + cognitiveservices/v1；ElevenLabs 使用 xi-api-key 和 text-to-speech/{voice_id}。
// 4. 对音频响应做了更宽松的判断，binary/octet-stream 也可播放。
// 5. 无远程 TTS 时回退 Web Speech API，失败则静默，不影响聊天。
// 会不会影响其他文件：
// - 一般不需要改其他文件。
// - 如果 settings.js 后续补 provider / language / voice / model，兼容会更完整。
// - 现有调用方只要继续用 playTTS / stopAll 即可。
