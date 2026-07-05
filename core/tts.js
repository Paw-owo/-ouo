// core/tts.js
// 文本转语音：4 种 provider + Web Speech 回退。
// 修复原 bug：
//  1) cleanTextForSpeech 必须过滤 ~thinking~ 标签
//  2) MAX_INPUT_LENGTH 截断必须 toast 提示
//  3) playTTS 返回支持 stop() 和 onEnd
//  4) voice_settings 可配
//  5) voice 不硬编码中文
//  6) audio.play 被阻止时 fallback 到 Web Speech
// 依赖：core/storage.js, core/config.js, core/ui.js

import { getData, setData } from './storage.js';
import { get as getConfig } from './config.js';
import { showToast } from './ui.js';
import { KEYS } from './storage-keys.js';

const MAX_INPUT_LENGTH = 500;
const PROVIDERS = Object.freeze({
  webSpeech: 'webspeech',
  siliconflow: 'siliconflow',
  openai: 'openai',
  elevenlabs: 'elevenlabs'
});

export function getTTSConfig() {
  return getData(KEYS.ttsConfig, {
    provider: PROVIDERS.webSpeech,
    voice: '',
    rate: 1.0,
    pitch: 1.0,
    volume: 1.0,
    apiKey: '',
    model: '',
    voice_settings: { stability: 0.5, similarity_boost: 0.75 }
  });
}

export function setTTSConfig(cfg) {
  const cur = getTTSConfig();
  return setData(KEYS.ttsConfig, { ...cur, ...cfg });
}

// 修复：cleanTextForSpeech 必须过滤 ~thinking~ 标签
export function cleanTextForSpeech(text) {
  if (!text) return '';
  let s = String(text);
  // 过滤思考标签（新旧兼容）
  s = s.replace(/~thinking~[\s\S]*?~thinking~/g, '');
  s = s.replace(/~think_summary~[\s\S]*?~think_summary~/g, '');
  s = s.replace(/<thinking>[\s\S]*?<\/thinking>/g, '');
  // 过滤 markdown
  s = s.replace(/```[\s\S]*?```/g, '');
  s = s.replace(/`([^`]+)`/g, '$1');
  s = s.replace(/[*_~#>]/g, '');
  // 过滤 emoji
  s = s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '');
  // 过滤 URL
  s = s.replace(/https?:\/\/\S+/g, '链接');
  // 折叠空白
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * 播放 TTS。返回 { stop, onEnd } 控制器。
 * @param {string} text
 * @param {object} opts { onBoundary }
 */
export async function playTTS(text, opts = {}) {
  const cfg = getTTSConfig();
  let cleaned = cleanTextForSpeech(text);
  if (!cleaned) return { stop: () => {} };

  // 修复：超长截断必须 toast 提示
  if (cleaned.length > MAX_INPUT_LENGTH) {
    cleaned = cleaned.slice(0, MAX_INPUT_LENGTH);
    showToast(`话太长啦，我只念前 ${MAX_INPUT_LENGTH} 个字哦`);
  }

  try {
    if (cfg.provider === PROVIDERS.webSpeech) {
      return await playWebSpeech(cleaned, cfg, opts);
    }
    // 其他 provider 走音频
    const audioUrl = await synthesizeRemote(cleaned, cfg);
    if (!audioUrl) {
      // fallback
      return await playWebSpeech(cleaned, cfg, opts);
    }
    return await playAudio(audioUrl, cfg, opts, cleaned);
  } catch (e) {
    console.warn('[tts] 播放失败，回退到 Web Speech', e);
    return await playWebSpeech(cleaned, cfg, opts);
  }
}

// ════════════════════════════════════════
// Web Speech API
// ════════════════════════════════════════

function playWebSpeech(text, cfg, opts = {}) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve({ stop: () => {} });
      return;
    }
    try {
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = cfg.rate || 1.0;
      utter.pitch = cfg.pitch || 1.0;
      utter.volume = cfg.volume ?? 1.0;
      // 修复：voice 不硬编码中文，根据 cfg.voice 选择
      if (cfg.voice) {
        const voices = speechSynthesis.getVoices() || [];
        const found = voices.find((v) => v.name === cfg.voice || v.voiceURI === cfg.voice);
        if (found) utter.voice = found;
      }
      // 自动选中文声音
      if (!utter.voice) {
        const voices = speechSynthesis.getVoices() || [];
        const zh = voices.find((v) => (v.lang || '').toLowerCase().startsWith('zh'));
        if (zh) utter.voice = zh;
      }
      const ctrl = {
        stop: () => {
          try { speechSynthesis.cancel(); } catch (e) {}
          if (typeof ctrl.onEnd === 'function') ctrl.onEnd();
        },
        onEnd: null
      };
      utter.onboundary = (e) => {
        if (typeof opts.onBoundary === 'function') opts.onBoundary(e);
      };
      utter.onend = () => {
        if (typeof ctrl.onEnd === 'function') ctrl.onEnd();
      };
      utter.onerror = (e) => {
        console.warn('[tts] Web Speech 错误', e);
        if (typeof ctrl.onEnd === 'function') ctrl.onEnd();
      };
      speechSynthesis.cancel();
      speechSynthesis.speak(utter);
      resolve(ctrl);
    } catch (e) {
      console.warn('[tts] Web Speech 初始化失败', e);
      resolve({ stop: () => {} });
    }
  });
}

// ════════════════════════════════════════
// 远程合成
// ════════════════════════════════════════

async function synthesizeRemote(text, cfg) {
  switch (cfg.provider) {
    case PROVIDERS.openai: return synthOpenAI(text, cfg);
    case PROVIDERS.siliconflow: return synthSiliconFlow(text, cfg);
    case PROVIDERS.elevenlabs: return synthElevenLabs(text, cfg);
    default: return null;
  }
}

async function synthOpenAI(text, cfg) {
  if (!cfg.apiKey) return null;
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`
    },
    body: JSON.stringify({
      model: cfg.model || 'tts-1',
      voice: cfg.voice || 'alloy',
      input: text
    })
  });
  if (!res.ok) throw new Error(`OpenAI TTS HTTP ${res.status}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

async function synthSiliconFlow(text, cfg) {
  if (!cfg.apiKey) return null;
  const res = await fetch('https://api.siliconflow.cn/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`
    },
    body: JSON.stringify({
      model: cfg.model || 'FishAudio/fish-speech-1.5',
      voice: cfg.voice || '',
      input: text
    })
  });
  if (!res.ok) throw new Error(`SiliconFlow TTS HTTP ${res.status}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

async function synthElevenLabs(text, cfg) {
  if (!cfg.apiKey || !cfg.voice) return null;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${cfg.voice}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': cfg.apiKey
    },
    body: JSON.stringify({
      text,
      model_id: cfg.model || 'eleven_multilingual_v2',
      voice_settings: cfg.voice_settings || { stability: 0.5, similarity_boost: 0.75 }
    })
  });
  if (!res.ok) throw new Error(`ElevenLabs HTTP ${res.status}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

// ════════════════════════════════════════
// 音频播放（修复：被阻止时 fallback Web Speech，传 cleaned 而非原始 text）
// ════════════════════════════════════════

function playAudio(url, cfg, opts = {}, cleaned) {
  return new Promise((resolve) => {
    const audio = new Audio(url);
    audio.playbackRate = Number(cfg.rate) || 1.0;
    const ctrl = {
      stop: () => {
        try { audio.pause(); audio.src = ''; } catch (e) {}
        if (typeof ctrl.onEnd === 'function') ctrl.onEnd();
      },
      onEnd: null
    };
    audio.onended = () => {
      URL.revokeObjectURL(url);
      if (typeof ctrl.onEnd === 'function') ctrl.onEnd();
    };
    audio.onerror = async (e) => {
      console.warn('[tts] 音频播放失败，回退 Web Speech', e);
      URL.revokeObjectURL(url);
      // 修复：原代码传了原始 text，应使用已清洗的 cleaned
      const fallback = await playWebSpeech(cleaned || '', cfg, opts);
      resolve(fallback);
    };
    audio.play().catch(async (e) => {
      console.warn('[tts] play() 被阻止，回退 Web Speech', e);
      URL.revokeObjectURL(url);
      // 修复：删除 cfg._cleanedText（从未赋值），直接传 cleaned
      const fallback = await playWebSpeech(cleaned || '', cfg, opts);
      resolve(fallback);
    });
    resolve(ctrl);
  });
}

export function stopAllTTS() {
  try {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  } catch (e) {}
}

// 预加载 voices（部分浏览器异步）
export function preloadVoices() {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.getVoices();
  if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
  }
}

export function listVoices() {
  if (!('speechSynthesis' in window)) return [];
  return (speechSynthesis.getVoices() || []).map((v) => ({
    name: v.name, lang: v.lang, voiceURI: v.voiceURI
  }));
}

export { PROVIDERS as TTS_PROVIDERS };
