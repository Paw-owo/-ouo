import {
  readState,
  getTtsConfig,
  getCharacter,
  saveTtsConfig,
  createTtsConfig,
} from "./storage.js";

export const TTS_PROVIDERS = [
  {
    id: "browser",
    name: "浏览器语音",
    voices: [],
  },
  {
    id: "openai",
    name: "OpenAI 语音",
    voices: ["alloy", "ash", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"],
  },
  {
    id: "custom",
    name: "自定义接口",
    voices: [],
  },
];

let currentAudio = null;
let currentUtterance = null;
let recognitionInstance = null;

export function getAvailableTtsConfigs() {
  return readState().ttsConfigs || [];
}

export function resolveTtsConfig({ ttsConfigId = "", characterId = "" } = {}) {
  const character = characterId ? getCharacter(characterId) : null;
  const characterInlineConfig = character?.ttsConfig?.enabled ? character.ttsConfig : null;
  const savedConfig = getTtsConfig(ttsConfigId || character?.ttsConfigId || "");

  if (savedConfig?.enabled) return savedConfig;
  if (characterInlineConfig) return {
    id: `${character.id}_inline_tts`,
    name: `${character.name}语音`,
    provider: characterInlineConfig.provider || "openai",
    endpoint: characterInlineConfig.endpoint || "",
    apiKey: characterInlineConfig.apiKey || "",
    model: characterInlineConfig.model || "tts-1",
    voice: characterInlineConfig.voice || "nova",
    enabled: true,
    autoPlay: false,
  };

  return savedConfig || readState().ttsConfigs?.[0] || null;
}

export function saveResolvedTtsConfig(config) {
  return saveTtsConfig({
    ...createTtsConfig(),
    ...config,
  });
}

export async function speakText(text, options = {}) {
  const cleanText = sanitizeSpeechText(text);
  if (!cleanText) return null;

  stopSpeaking();

  const config = resolveTtsConfig(options);
  if (!config?.enabled && options.force !== true) return null;

  if (!config || config.provider === "browser") {
    return speakWithBrowser(cleanText, config || options);
  }

  if (config.provider === "openai" || config.provider === "custom") {
    return speakWithOpenAICompatible(cleanText, config, options);
  }

  return speakWithBrowser(cleanText, config);
}

export function stopSpeaking() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }

  if (currentUtterance) {
    speechSynthesis.cancel();
    currentUtterance = null;
  }
}

export function isSpeaking() {
  return Boolean(currentAudio && !currentAudio.paused) || speechSynthesis.speaking;
}

export function speakWithBrowser(text, config = {}) {
  return new Promise((resolve, reject) => {
    if (!("speechSynthesis" in window)) {
      reject(new Error("当前浏览器不支持语音朗读"));
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = config.lang || "zh-CN";
    utterance.rate = Number(config.rate) || 1;
    utterance.pitch = Number(config.pitch) || 1;
    utterance.volume = Number(config.volume) || 1;

    const voice = getBrowserVoice(config.voice);
    if (voice) utterance.voice = voice;

    utterance.onend = () => {
      currentUtterance = null;
      resolve();
    };
    utterance.onerror = (event) => {
      currentUtterance = null;
      reject(new Error(event.error || "语音朗读失败"));
    };

    currentUtterance = utterance;
    speechSynthesis.speak(utterance);
  });
}

export async function speakWithOpenAICompatible(text, config = {}, options = {}) {
  const endpoint = normalizeTtsEndpoint(config.endpoint || options.endpoint);
  if (!endpoint) throw new Error("请先填写 TTS endpoint");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: createTtsHeaders(config),
    body: JSON.stringify({
      model: config.model || "tts-1",
      voice: config.voice || "nova",
      input: text,
      response_format: options.format || "mp3",
      speed: Number(config.speed) || 1,
    }),
  });

  if (!response.ok) {
    throw new Error(await readTtsError(response));
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);

  currentAudio = audio;

  return new Promise((resolve, reject) => {
    audio.onended = () => {
      URL.revokeObjectURL(url);
      currentAudio = null;
      resolve();
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      currentAudio = null;
      reject(new Error("音频播放失败"));
    };
    audio.play().catch((error) => {
      URL.revokeObjectURL(url);
      currentAudio = null;
      reject(error);
    });
  });
}

export function normalizeTtsEndpoint(endpoint = "") {
  const clean = String(endpoint || "").trim().replace(/\/+$/, "");
  if (!clean) return "";
  if (clean.endsWith("/audio/speech")) return clean;
  if (clean.endsWith("/v1")) return `${clean}/audio/speech`;
  return `${clean}/v1/audio/speech`;
}

export function createTtsHeaders(config = {}) {
  const headers = {
    "Content-Type": "application/json",
  };

  const key = config.apiKey || config.key;
  if (key) headers.Authorization = `Bearer ${key}`;

  return headers;
}

export async function readTtsError(response) {
  try {
    const data = await response.json();
    return data?.error?.message || data?.message || `语音请求失败：${response.status}`;
  } catch {
    return `语音请求失败：${response.status}`;
  }
}

export function sanitizeSpeechText(text = "") {
  return String(text)
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .replace(/```[\s\S]*?```/g, "代码内容")
    .replace(/[#*_>`~\[\]()]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}

export function getBrowserVoices() {
  if (!("speechSynthesis" in window)) return [];
  return speechSynthesis.getVoices().map((voice) => ({
    name: voice.name,
    lang: voice.lang,
    default: voice.default,
    localService: voice.localService,
  }));
}

export function getBrowserVoice(nameOrLang = "") {
  if (!("speechSynthesis" in window)) return null;
  const voices = speechSynthesis.getVoices();
  if (!nameOrLang) {
    return voices.find((voice) => voice.lang.includes("zh")) || voices[0] || null;
  }

  return voices.find((voice) => voice.name === nameOrLang)
    || voices.find((voice) => voice.lang === nameOrLang)
    || voices.find((voice) => voice.lang.includes(nameOrLang))
    || null;
}

export function preloadBrowserVoices(callback) {
  if (!("speechSynthesis" in window)) return [];

  const voices = getBrowserVoices();
  if (voices.length) {
    callback?.(voices);
    return voices;
  }

  speechSynthesis.onvoiceschanged = () => callback?.(getBrowserVoices());
  return [];
}

export function createSpeechRecognizer(options = {}) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) throw new Error("当前浏览器不支持语音识别");

  const recognition = new Recognition();
  recognition.lang = options.lang || "zh-CN";
  recognition.interimResults = options.interimResults ?? true;
  recognition.continuous = options.continuous ?? false;
  recognition.maxAlternatives = options.maxAlternatives || 1;

  return recognition;
}

export function startSpeechRecognition({
  lang = "zh-CN",
  onStart,
  onInterim,
  onResult,
  onEnd,
  onError,
} = {}) {
  stopSpeechRecognition();

  recognitionInstance = createSpeechRecognizer({ lang, interimResults: true });
  let finalText = "";

  recognitionInstance.onstart = () => onStart?.();
  recognitionInstance.onresult = (event) => {
    let interimText = "";

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const transcript = result[0]?.transcript || "";
      if (result.isFinal) finalText += transcript;
      else interimText += transcript;
    }

    if (interimText) onInterim?.(interimText);
    if (finalText) onResult?.(finalText);
  };

  recognitionInstance.onerror = (event) => {
    onError?.(new Error(event.error || "语音识别失败"));
  };

  recognitionInstance.onend = () => {
    const text = finalText.trim();
    recognitionInstance = null;
    onEnd?.(text);
  };

  recognitionInstance.start();
  return recognitionInstance;
}

export function stopSpeechRecognition() {
  if (recognitionInstance) {
    recognitionInstance.stop();
    recognitionInstance = null;
  }
}

export function abortSpeechRecognition() {
  if (recognitionInstance) {
    recognitionInstance.abort();
    recognitionInstance = null;
  }
}

export function bindHoldToRecord(button, handlers = {}) {
  let recording = false;

  const start = (event) => {
    event.preventDefault();
    if (recording) return;
    recording = true;
    stopSpeaking();

    startSpeechRecognition({
      onStart: handlers.onStart,
      onInterim: handlers.onInterim,
      onResult: handlers.onResult,
      onEnd: (text) => {
        recording = false;
        handlers.onEnd?.(text);
      },
      onError: (error) => {
        recording = false;
        handlers.onError?.(error);
      },
    });
  };

  const stop = (event) => {
    event.preventDefault();
    if (!recording) return;
    stopSpeechRecognition();
  };

  button.addEventListener("pointerdown", start);
  button.addEventListener("pointerup", stop);
  button.addEventListener("pointercancel", stop);
  button.addEventListener("pointerleave", stop);

  return () => {
    button.removeEventListener("pointerdown", start);
    button.removeEventListener("pointerup", stop);
    button.removeEventListener("pointercancel", stop);
    button.removeEventListener("pointerleave", stop);
  };
}

export function createVoiceWaveElement(barCount = 5) {
  const wave = document.createElement("div");
  wave.className = "voice-wave";

  Array.from({ length: barCount }).forEach(() => {
    wave.append(document.createElement("span"));
  });

  return wave;
}

export async function autoSpeakIfEnabled(text, { characterId = "", ttsConfigId = "" } = {}) {
  const config = resolveTtsConfig({ characterId, ttsConfigId });
  if (!config?.enabled || !config?.autoPlay) return null;
  return speakText(text, { characterId, ttsConfigId });
}

/* 待后续文件对齐：chat.js 的录音按钮使用 bindHoldToRecord，AI 回复下方播放按钮使用 speakText/stopSpeaking。 */
