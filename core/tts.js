import {
  getSettings,
  updateSettings,
  getCharacter,
  DEFAULT_TTS_CONFIG,
  readLocal,
  writeLocal,
  uuid,
  clone
} from './storage.js';

export const TTS_CONFIGS_KEY = 'ai_phone_tts_configs_v1';
export const TTS_DEFAULT_ID_KEY = 'ai_phone_tts_default_id_v1';
export const TTS_RUNTIME_KEY = 'ai_phone_tts_runtime_v1';

export const TTS_PROVIDERS = {
  browser: 'browser',
  openai: 'openai',
  custom: 'custom'
};

export const DEFAULT_TTS_MODEL = 'tts-1';
export const DEFAULT_TTS_VOICE = 'nova';

let currentAudio = null;
let currentUtterance = null;
let recognitionInstance = null;
let recognitionText = '';

export function normalizeTTSConfig(config = {}) {
  return {
    id: config.id || uuid(),
    name: config.name || config.label || '语音配置',
    provider: config.provider || DEFAULT_TTS_CONFIG.provider || TTS_PROVIDERS.openai,
    voice: config.voice || DEFAULT_TTS_VOICE,
    model: config.model || DEFAULT_TTS_MODEL,
    apiKey: config.apiKey || '',
    endpoint: config.endpoint || '',
    enabled: Boolean(config.enabled),
    rate: Number.isFinite(Number(config.rate)) ? Number(config.rate) : 1,
    pitch: Number.isFinite(Number(config.pitch)) ? Number(config.pitch) : 1,
    volume: Number.isFinite(Number(config.volume)) ? Number(config.volume) : 1,
    createdAt: config.createdAt || new Date().toISOString(),
    updatedAt: config.updatedAt || new Date().toISOString()
  };
}

export function normalizeTTSConfigs(configs = []) {
  return Array.isArray(configs) ? configs.map(normalizeTTSConfig) : [];
}

export function getLegacyTTSConfig() {
  const settings = getSettings();
  const config = normalizeTTSConfig({
    ...settings.ttsConfig,
    id: 'legacy-global-tts',
    name: '全局语音'
  });

  return config.endpoint || config.apiKey || config.enabled
    ? config
    : null;
}

export function getTTSConfigs() {
  const stored = normalizeTTSConfigs(readLocal(TTS_CONFIGS_KEY, []));
  const legacy = getLegacyTTSConfig();

  if (!legacy) {
    return stored;
  }

  const exists = stored.some((config) => config.id === legacy.id);

  return exists ? stored : [legacy, ...stored];
}

export function getTTSConfig(configId = '') {
  const configs = getTTSConfigs();

  if (!configId) {
    return null;
  }

  return configs.find((config) => config.id === configId) || null;
}

export function getDefaultTTSConfigId() {
  try {
    return localStorage.getItem(TTS_DEFAULT_ID_KEY) || '';
  } catch {
    return '';
  }
}

export function setDefaultTTSConfigId(configId = '') {
  try {
    localStorage.setItem(TTS_DEFAULT_ID_KEY, configId);
  } catch {}

  window.dispatchEvent(new CustomEvent('ai-phone-tts-default-change', {
    detail: configId
  }));

  return configId;
}

export function getDefaultTTSConfig() {
  const configs = getTTSConfigs();

  if (!configs.length) {
    return normalizeTTSConfig({
      id: 'browser-default-tts',
      name: '浏览器语音',
      provider: TTS_PROVIDERS.browser,
      enabled: false
    });
  }

  const defaultId = getDefaultTTSConfigId();

  return configs.find((config) => config.id === defaultId) || configs[0];
}

export function saveTTSConfig(config = {}) {
  const normalized = normalizeTTSConfig({
    ...config,
    updatedAt: new Date().toISOString()
  });

  const configs = normalizeTTSConfigs(readLocal(TTS_CONFIGS_KEY, []));
  const index = configs.findIndex((item) => item.id === normalized.id);

  if (index >= 0) {
    configs[index] = normalized;
  } else {
    configs.unshift(normalized);
  }

  writeLocal(TTS_CONFIGS_KEY, configs);

  if (!getDefaultTTSConfigId()) {
    setDefaultTTSConfigId(normalized.id);
  }

  updateLegacyGlobalConfig(normalized);

  window.dispatchEvent(new CustomEvent('ai-phone-tts-config-change', {
    detail: clone(configs)
  }));

  return normalized;
}

export function deleteTTSConfig(configId = '') {
  const configs = normalizeTTSConfigs(readLocal(TTS_CONFIGS_KEY, []))
    .filter((config) => config.id !== configId);

  writeLocal(TTS_CONFIGS_KEY, configs);

  if (getDefaultTTSConfigId() === configId) {
    setDefaultTTSConfigId(configs[0]?.id || '');
  }

  window.dispatchEvent(new CustomEvent('ai-phone-tts-config-change', {
    detail: clone(configs)
  }));

  return configs;
}

export function updateLegacyGlobalConfig(config = {}) {
  updateSettings((settings) => {
    settings.ttsConfig = {
      provider: config.provider || DEFAULT_TTS_CONFIG.provider,
      voice: config.voice || DEFAULT_TTS_CONFIG.voice,
      apiKey: config.apiKey || '',
      endpoint: config.endpoint || '',
      enabled: Boolean(config.enabled)
    };

    return settings;
  });
}

export function getRuntimeTTSMap() {
  try {
    return JSON.parse(sessionStorage.getItem(TTS_RUNTIME_KEY) || '{}');
  } catch {
    return {};
  }
}

export function setRuntimeTTSMap(map = {}) {
  try {
    sessionStorage.setItem(TTS_RUNTIME_KEY, JSON.stringify(map));
  } catch {}
}

export function getRuntimeTTS(conversationId = '') {
  if (!conversationId) {
    return null;
  }

  return getRuntimeTTSMap()[conversationId] || null;
}

export function setRuntimeTTS(conversationId = '', state = {}) {
  if (!conversationId) {
    return null;
  }

  const map = getRuntimeTTSMap();

  map[conversationId] = {
    enabled: Boolean(state.enabled),
    configId: state.configId || '',
    provider: state.provider || '',
    voice: state.voice || '',
    model: state.model || '',
    endpoint: state.endpoint || '',
    apiKey: state.apiKey || ''
  };

  setRuntimeTTSMap(map);

  window.dispatchEvent(new CustomEvent('ai-phone-tts-runtime-change', {
    detail: {
      conversationId,
      ttsState: map[conversationId]
    }
  }));

  return map[conversationId];
}

export function clearRuntimeTTS(conversationId = '') {
  const map = getRuntimeTTSMap();
  delete map[conversationId];
  setRuntimeTTSMap(map);
}

export function resolveTTSConfig(options = {}) {
  const character = options.characterId ? getCharacter(options.characterId) : options.character || null;
  const runtime = options.conversationId ? getRuntimeTTS(options.conversationId) : null;
  const runtimeBase = runtime?.configId ? getTTSConfig(runtime.configId) : null;
  const optionBase = options.configId ? getTTSConfig(options.configId) : null;
  const defaultBase = getDefaultTTSConfig();
  const characterBase = character?.ttsConfig ? normalizeTTSConfig({
    ...character.ttsConfig,
    id: character.ttsConfig.id || `character-${character.id}`,
    name: `${character.name || '角色'}语音`
  }) : null;

  const base = optionBase || runtimeBase || characterBase || defaultBase;

  return normalizeTTSConfig({
    ...base,
    enabled: options.enabled ?? runtime?.enabled ?? characterBase?.enabled ?? base?.enabled ?? false,
    provider: options.provider || runtime?.provider || base?.provider || TTS_PROVIDERS.browser,
    voice: options.voice || runtime?.voice || base?.voice || DEFAULT_TTS_VOICE,
    model: options.model || runtime?.model || base?.model || DEFAULT_TTS_MODEL,
    endpoint: options.endpoint || runtime?.endpoint || base?.endpoint || '',
    apiKey: options.apiKey || runtime?.apiKey || base?.apiKey || '',
    name: base?.name || '语音配置',
    id: base?.id || ''
  });
}

export function normalizeTTSEndpoint(endpoint = '', provider = TTS_PROVIDERS.openai) {
  const cleanEndpoint = String(endpoint || '').trim().replace(/\/+$/, '');

  if (!cleanEndpoint) {
    return '';
  }

  if (cleanEndpoint.endsWith('/audio/speech')) {
    return cleanEndpoint;
  }

  if (cleanEndpoint.endsWith('/v1')) {
    return `${cleanEndpoint}/audio/speech`;
  }

  if (provider === TTS_PROVIDERS.openai || provider === TTS_PROVIDERS.custom) {
    return `${cleanEndpoint}/v1/audio/speech`;
  }

  return cleanEndpoint;
}

export function createTTSHeaders(apiKey = '') {
  const headers = {
    'Content-Type': 'application/json'
  };

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

export function cleanTextForSpeech(text = '') {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, '代码内容已省略')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/\[[^\]]*?\]\([^)]*?\)/g, '')
    .replace(/[#>*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function speakText(text = '', options = {}) {
  const content = cleanTextForSpeech(text);

  if (!content) {
    return null;
  }

  const config = resolveTTSConfig(options);

  if (options.force !== true && config.enabled === false) {
    return null;
  }

  stopSpeech();

  if (config.provider === TTS_PROVIDERS.browser || !config.endpoint) {
    return speakWithBrowser(content, config, options);
  }

  return speakWithOpenAI(content, config, options);
}

export function speakWithBrowser(text = '', config = {}, options = {}) {
  return new Promise((resolve, reject) => {
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      reject(new Error('当前浏览器不支持语音朗读'));
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const matchedVoice = findBrowserVoice(config.voice, voices);

    if (matchedVoice) {
      utterance.voice = matchedVoice;
    }

    utterance.lang = matchedVoice?.lang || options.lang || 'zh-CN';
    utterance.rate = Number(config.rate || 1);
    utterance.pitch = Number(config.pitch || 1);
    utterance.volume = Number(config.volume || 1);

    currentUtterance = utterance;

    utterance.onstart = () => {
      window.dispatchEvent(new CustomEvent('ai-phone-tts-start', {
        detail: { text, config }
      }));

      if (typeof options.onStart === 'function') {
        options.onStart();
      }
    };

    utterance.onend = () => {
      currentUtterance = null;

      window.dispatchEvent(new CustomEvent('ai-phone-tts-end', {
        detail: { text, config }
      }));

      if (typeof options.onEnd === 'function') {
        options.onEnd();
      }

      resolve(true);
    };

    utterance.onerror = (event) => {
      currentUtterance = null;

      window.dispatchEvent(new CustomEvent('ai-phone-tts-error', {
        detail: event
      }));

      if (typeof options.onError === 'function') {
        options.onError(event);
      }

      reject(event.error || new Error('语音朗读失败'));
    };

    window.speechSynthesis.speak(utterance);
  });
}

export function findBrowserVoice(voiceName = '', voices = []) {
  if (!voiceName) {
    return voices.find((voice) => voice.lang?.toLowerCase().startsWith('zh')) || voices[0] || null;
  }

  const keyword = String(voiceName).toLowerCase();

  return voices.find((voice) => {
    return voice.name.toLowerCase() === keyword
      || voice.name.toLowerCase().includes(keyword)
      || voice.lang.toLowerCase().includes(keyword);
  }) || null;
}

export async function speakWithOpenAI(text = '', config = {}, options = {}) {
  const url = normalizeTTSEndpoint(config.endpoint, config.provider);

  if (!url) {
    throw new Error('请先填写TTS端点');
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: createTTSHeaders(config.apiKey),
    body: JSON.stringify({
      model: config.model || DEFAULT_TTS_MODEL,
      voice: config.voice || DEFAULT_TTS_VOICE,
      input: text,
      response_format: options.responseFormat || 'mp3',
      speed: Number(config.rate || 1)
    }),
    signal: options.signal
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(message || `语音请求失败：${response.status}`);
  }

  const blob = await response.blob();
  const urlObject = URL.createObjectURL(blob);
  const audio = new Audio(urlObject);

  currentAudio = audio;
  audio.volume = Number(config.volume || 1);

  return new Promise((resolve, reject) => {
    audio.onplay = () => {
      window.dispatchEvent(new CustomEvent('ai-phone-tts-start', {
        detail: { text, config }
      }));

      if (typeof options.onStart === 'function') {
        options.onStart();
      }
    };

    audio.onended = () => {
      URL.revokeObjectURL(urlObject);
      currentAudio = null;

      window.dispatchEvent(new CustomEvent('ai-phone-tts-end', {
        detail: { text, config }
      }));

      if (typeof options.onEnd === 'function') {
        options.onEnd();
      }

      resolve(true);
    };

    audio.onerror = () => {
      URL.revokeObjectURL(urlObject);
      currentAudio = null;

      const error = new Error('语音播放失败');

      window.dispatchEvent(new CustomEvent('ai-phone-tts-error', {
        detail: error
      }));

      if (typeof options.onError === 'function') {
        options.onError(error);
      }

      reject(error);
    };

    audio.play().catch((error) => {
      URL.revokeObjectURL(urlObject);
      currentAudio = null;
      reject(error);
    });
  });
}

export function stopSpeech() {
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch {}

    currentAudio = null;
  }

  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {}
  }

  currentUtterance = null;

  window.dispatchEvent(new CustomEvent('ai-phone-tts-stop'));

  return true;
}

export function pauseSpeech() {
  if (currentAudio && !currentAudio.paused) {
    currentAudio.pause();
  }

  if ('speechSynthesis' in window) {
    window.speechSynthesis.pause();
  }
}

export function resumeSpeech() {
  if (currentAudio && currentAudio.paused) {
    currentAudio.play().catch(() => {});
  }

  if ('speechSynthesis' in window) {
    window.speechSynthesis.resume();
  }
}

export function isSpeaking() {
  const browserSpeaking = 'speechSynthesis' in window && window.speechSynthesis.speaking;
  const audioSpeaking = currentAudio && !currentAudio.paused;

  return Boolean(browserSpeaking || audioSpeaking || currentUtterance);
}

export function getBrowserVoices() {
  if (!('speechSynthesis' in window)) {
    return [];
  }

  return window.speechSynthesis.getVoices().map((voice) => ({
    name: voice.name,
    lang: voice.lang,
    localService: voice.localService,
    default: voice.default
  }));
}

export function waitForBrowserVoices() {
  return new Promise((resolve) => {
    const voices = getBrowserVoices();

    if (voices.length) {
      resolve(voices);
      return;
    }

    if (!('speechSynthesis' in window)) {
      resolve([]);
      return;
    }

    const handler = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', handler);
      resolve(getBrowserVoices());
    };

    window.speechSynthesis.addEventListener('voiceschanged', handler);

    window.setTimeout(() => {
      window.speechSynthesis.removeEventListener('voiceschanged', handler);
      resolve(getBrowserVoices());
    }, 1200);
  });
}

export function getSpeechRecognitionConstructor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function isSpeechRecognitionSupported() {
  return Boolean(getSpeechRecognitionConstructor());
}

export function createSpeechRecognizer(options = {}) {
  const SpeechRecognition = getSpeechRecognitionConstructor();

  if (!SpeechRecognition) {
    throw new Error('当前浏览器不支持语音识别');
  }

  const recognition = new SpeechRecognition();

  recognition.lang = options.lang || 'zh-CN';
  recognition.continuous = options.continuous !== false;
  recognition.interimResults = options.interimResults !== false;
  recognition.maxAlternatives = Number(options.maxAlternatives || 1);

  return recognition;
}

export function startSpeechRecognition(options = {}) {
  stopSpeechRecognition();

  recognitionText = '';

  const recognition = createSpeechRecognizer(options);
  recognitionInstance = recognition;

  recognition.onstart = () => {
    stopSpeech();

    window.dispatchEvent(new CustomEvent('ai-phone-speech-record-start'));

    if (typeof options.onStart === 'function') {
      options.onStart();
    }
  };

  recognition.onresult = (event) => {
    let finalText = '';
    let interimText = '';

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const transcript = result[0]?.transcript || '';

      if (result.isFinal) {
        finalText += transcript;
      } else {
        interimText += transcript;
      }
    }

    if (finalText) {
      recognitionText += finalText;
    }

    const currentText = `${recognitionText}${interimText}`.trim();

    window.dispatchEvent(new CustomEvent('ai-phone-speech-record-result', {
      detail: {
        text: currentText,
        finalText: recognitionText.trim(),
        interimText
      }
    }));

    if (typeof options.onResult === 'function') {
      options.onResult(currentText, {
        finalText: recognitionText.trim(),
        interimText,
        event
      });
    }
  };

  recognition.onerror = (event) => {
    window.dispatchEvent(new CustomEvent('ai-phone-speech-record-error', {
      detail: event
    }));

    if (typeof options.onError === 'function') {
      options.onError(event);
    }
  };

  recognition.onend = () => {
    const text = recognitionText.trim();

    recognitionInstance = null;

    window.dispatchEvent(new CustomEvent('ai-phone-speech-record-end', {
      detail: { text }
    }));

    if (typeof options.onEnd === 'function') {
      options.onEnd(text);
    }
  };

  recognition.start();

  return recognition;
}

export function stopSpeechRecognition() {
  if (!recognitionInstance) {
    return recognitionText.trim();
  }

  try {
    recognitionInstance.stop();
  } catch {}

  const text = recognitionText.trim();
  recognitionInstance = null;

  return text;
}

export function abortSpeechRecognition() {
  if (!recognitionInstance) {
    recognitionText = '';
    return '';
  }

  try {
    recognitionInstance.abort();
  } catch {}

  recognitionText = '';
  recognitionInstance = null;

  window.dispatchEvent(new CustomEvent('ai-phone-speech-record-cancel'));

  return '';
}

export function createHoldToRecordHandlers(options = {}) {
  let started = false;

  const start = (event) => {
    event.preventDefault();

    if (started) {
      return;
    }

    started = true;

    try {
      startSpeechRecognition(options);
    } catch (error) {
      started = false;

      if (typeof options.onError === 'function') {
        options.onError(error);
      }
    }
  };

  const stop = (event) => {
    event.preventDefault();

    if (!started) {
      return;
    }

    started = false;
    stopSpeechRecognition();
  };

  const cancel = (event) => {
    event.preventDefault();

    if (!started) {
      return;
    }

    started = false;
    abortSpeechRecognition();
  };

  return {
    start,
    stop,
    cancel,
    bind(element) {
      element.addEventListener('mousedown', start);
      element.addEventListener('touchstart', start, { passive: false });
      element.addEventListener('mouseup', stop);
      element.addEventListener('mouseleave', cancel);
      element.addEventListener('touchend', stop);
      element.addEventListener('touchcancel', cancel);

      return () => {
        element.removeEventListener('mousedown', start);
        element.removeEventListener('touchstart', start);
        element.removeEventListener('mouseup', stop);
        element.removeEventListener('mouseleave', cancel);
        element.removeEventListener('touchend', stop);
        element.removeEventListener('touchcancel', cancel);
      };
    }
  };
}

export function createWaveformElement(barCount = 18) {
  const wrap = document.createElement('div');

  wrap.className = 'voice-waveform';

  for (let index = 0; index < barCount; index += 1) {
    const bar = document.createElement('span');
    bar.style.animationDelay = `${index * 36}ms`;
    bar.style.height = `${8 + (index % 5) * 4}px`;
    wrap.appendChild(bar);
  }

  return wrap;
}

export function ttsConfigToCharacterConfig(config = {}) {
  const normalized = normalizeTTSConfig(config);

  return {
    provider: normalized.provider,
    voice: normalized.voice,
    apiKey: normalized.apiKey,
    endpoint: normalized.endpoint,
    enabled: normalized.enabled
  };
}

export function onTTSConfigChange(callback) {
  const handler = (event) => callback(event.detail || getTTSConfigs());
  window.addEventListener('ai-phone-tts-config-change', handler);

  return () => {
    window.removeEventListener('ai-phone-tts-config-change', handler);
  };
}

export function onTTSRuntimeChange(callback) {
  const handler = (event) => callback(event.detail);
  window.addEventListener('ai-phone-tts-runtime-change', handler);

  return () => {
    window.removeEventListener('ai-phone-tts-runtime-change', handler);
  };
}

export function onSpeechRecord(callbacks = {}) {
  const start = () => callbacks.onStart?.();
  const result = (event) => callbacks.onResult?.(event.detail);
  const end = (event) => callbacks.onEnd?.(event.detail?.text || '');
  const error = (event) => callbacks.onError?.(event.detail);

  window.addEventListener('ai-phone-speech-record-start', start);
  window.addEventListener('ai-phone-speech-record-result', result);
  window.addEventListener('ai-phone-speech-record-end', end);
  window.addEventListener('ai-phone-speech-record-error', error);

  return () => {
    window.removeEventListener('ai-phone-speech-record-start', start);
    window.removeEventListener('ai-phone-speech-record-result', result);
    window.removeEventListener('ai-phone-speech-record-end', end);
    window.removeEventListener('ai-phone-speech-record-error', error);
  };
}

export function onSpeechState(callbacks = {}) {
  const start = (event) => callbacks.onStart?.(event.detail);
  const end = (event) => callbacks.onEnd?.(event.detail);
  const stop = () => callbacks.onStop?.();
  const error = (event) => callbacks.onError?.(event.detail);

  window.addEventListener('ai-phone-tts-start', start);
  window.addEventListener('ai-phone-tts-end', end);
  window.addEventListener('ai-phone-tts-stop', stop);
  window.addEventListener('ai-phone-tts-error', error);

  return () => {
    window.removeEventListener('ai-phone-tts-start', start);
    window.removeEventListener('ai-phone-tts-end', end);
    window.removeEventListener('ai-phone-tts-stop', stop);
    window.removeEventListener('ai-phone-tts-error', error);
  };
}
