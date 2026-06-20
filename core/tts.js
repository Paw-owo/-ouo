import {
  getSettings,
  getNowInfo
} from "./storage.js";

import {
  silentJsonRequest,
  getResolvedCharacterApiConfig
} from "./api.js";

let currentAudio = null;
let currentObjectUrl = "";
let isSpeaking = false;

function safeTrim(value) {
  return String(value || "").trim();
}

function normalizeEndpoint(endpoint) {
  return safeTrim(endpoint).replace(/\/+$/, "");
}

function getCharacterTtsConfig(character = {}) {
  const settings = getSettings();
  const globalTts = settings.globalTts || {};
  const characterTts = character.ttsConfig || {};

  return {
    provider: characterTts.provider || globalTts.provider || "browser",
    voice: characterTts.voice || globalTts.voice || "default",
    voiceId: characterTts.voiceId || globalTts.voiceId || characterTts.voice || globalTts.voice || "default",
    model: characterTts.model || globalTts.model || "tts-1",
    apiKey: characterTts.apiKey || globalTts.apiKey || "",
    endpoint: characterTts.endpoint || globalTts.endpoint || "",
    enabled: characterTts.enabled === true || globalTts.enabled === true,
    autoSpeak: characterTts.autoSpeak === true || globalTts.autoSpeak === true,
    autoVoiceDecision: characterTts.autoVoiceDecision === true || globalTts.autoVoiceDecision === true,
    allowCallIntent: characterTts.allowCallIntent === true || globalTts.allowCallIntent === true
  };
}

function assertTtsConfig(config) {
  if (!config.enabled) {
    throw new Error("TTS 未启用");
  }

  if (!config.provider) {
    throw new Error("缺少 TTS 服务商");
  }

  if (!config.voice && !config.voiceId && config.provider !== "browser") {
    throw new Error("缺少 TTS 声音名或语音 ID");
  }

  if (!config.apiKey && config.provider !== "browser") {
    throw new Error("缺少 TTS API Key");
  }
}

function cleanupCurrentAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }

  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = "";
  }

  isSpeaking = false;
}

function createAudioFromBlob(blob) {
  cleanupCurrentAudio();

  currentObjectUrl = URL.createObjectURL(blob);
  currentAudio = new Audio(currentObjectUrl);

  currentAudio.addEventListener("ended", cleanupCurrentAudio);
  currentAudio.addEventListener("error", cleanupCurrentAudio);

  return currentAudio;
}

function escapeXml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function base64ToBlob(base64, mimeType = "audio/mp3") {
  const cleanBase64 = String(base64 || "").includes(",")
    ? String(base64).split(",").pop()
    : String(base64 || "");

  const binary = atob(cleanBase64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], {
    type: mimeType
  });
}

async function speakWithOpenAI({
  text,
  voiceId,
  model,
  apiKey,
  endpoint
}) {
  const baseEndpoint = normalizeEndpoint(endpoint) || "https://api.openai.com/v1";
  const url = baseEndpoint.endsWith("/audio/speech")
    ? baseEndpoint
    : `${baseEndpoint}/audio/speech`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: model || "tts-1",
      voice: voiceId || "nova",
      input: text,
      response_format: "mp3"
    })
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(errorText || `TTS 请求失败：${response.status}`);
  }

  const blob = await response.blob();
  const audio = createAudioFromBlob(blob);

  isSpeaking = true;
  await audio.play();

  return true;
}

async function speakWithAzure({
  text,
  voiceId,
  apiKey,
  endpoint
}) {
  const url = normalizeEndpoint(endpoint);

  if (!url) {
    throw new Error("缺少 Azure TTS 地址");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": apiKey,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3"
    },
    body: `
      <speak version="1.0" xml:lang="zh-CN">
        <voice name="${escapeXml(voiceId)}">
          ${escapeXml(text)}
        </voice>
      </speak>
    `.trim()
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(errorText || `Azure TTS 请求失败：${response.status}`);
  }

  const blob = await response.blob();
  const audio = createAudioFromBlob(blob);

  isSpeaking = true;
  await audio.play();

  return true;
}

async function speakWithCustom({
  text,
  voice,
  voiceId,
  model,
  apiKey,
  endpoint
}) {
  const url = normalizeEndpoint(endpoint);

  if (!url) {
    throw new Error("缺少自定义 TTS 地址");
  }

  const headers = {
    "Content-Type": "application/json"
  };

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      text,
      voice,
      voiceId,
      model
    })
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(errorText || `自定义 TTS 请求失败：${response.status}`);
  }

  const contentType = response.headers.get("Content-Type") || "";

  if (contentType.includes("application/json")) {
    const data = await response.json();

    if (data.audioUrl) {
      cleanupCurrentAudio();

      currentAudio = new Audio(data.audioUrl);
      currentAudio.addEventListener("ended", cleanupCurrentAudio);
      currentAudio.addEventListener("error", cleanupCurrentAudio);

      isSpeaking = true;
      await currentAudio.play();

      return true;
    }

    if (data.audioBase64) {
      const blob = base64ToBlob(data.audioBase64, data.mimeType || "audio/mp3");
      const audio = createAudioFromBlob(blob);

      isSpeaking = true;
      await audio.play();

      return true;
    }

    throw new Error("自定义 TTS 返回 JSON 中缺少 audioUrl 或 audioBase64");
  }

  const blob = await response.blob();
  const audio = createAudioFromBlob(blob);

  isSpeaking = true;
  await audio.play();

  return true;
}

async function speakWithBrowser(text, voiceId = "default") {
  if (!("speechSynthesis" in window)) {
    throw new Error("当前浏览器不支持内置朗读");
  }

  stopTts();

  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const matchedVoice = voices.find((voice) => {
      return voice.name === voiceId || voice.voiceURI === voiceId;
    });

    if (matchedVoice) {
      utterance.voice = matchedVoice;
      utterance.lang = matchedVoice.lang || "zh-CN";
    } else {
      utterance.lang = "zh-CN";
    }

    utterance.rate = 1;
    utterance.pitch = 1;

    utterance.onstart = () => {
      isSpeaking = true;
    };

    utterance.onend = () => {
      isSpeaking = false;
      resolve(true);
    };

    utterance.onerror = () => {
      isSpeaking = false;
      reject(new Error("浏览器朗读失败"));
    };

    window.speechSynthesis.speak(utterance);
  });
}

async function openCallInterface({
  character,
  openingText = "",
  callTitle = ""
} = {}) {
  if (!character || !character.id) {
    return false;
  }

  try {
    const module = await import("../apps/call.js");

    if (typeof module.startCallSession !== "function") {
      return false;
    }

    module.startCallSession({
      characterId: character.id,
      openingText: openingText || callTitle || `${character.name || "角色"}想和你通话。`,
      autoSpeakOpening: true
    });

    return true;
  } catch (error) {
    console.warn("打开电话界面失败：", error);
    return false;
  }
}

export function isTtsSpeaking() {
  return isSpeaking;
}

export function stopTts() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }

  cleanupCurrentAudio();
}

export function pauseTts() {
  if (currentAudio && !currentAudio.paused) {
    currentAudio.pause();
    isSpeaking = false;
  }

  if ("speechSynthesis" in window && window.speechSynthesis.speaking) {
    window.speechSynthesis.pause();
    isSpeaking = false;
  }
}

export function resumeTts() {
  if (currentAudio && currentAudio.paused) {
    currentAudio.play();
    isSpeaking = true;
  }

  if ("speechSynthesis" in window && window.speechSynthesis.paused) {
    window.speechSynthesis.resume();
    isSpeaking = true;
  }
}

export async function speakText(text, config = {}) {
  const cleanText = safeTrim(text);

  if (!cleanText) {
    return false;
  }

  const finalConfig = {
    provider: config.provider || "browser",
    voice: config.voice || config.voiceId || "default",
    voiceId: config.voiceId || config.voice || "default",
    model: config.model || "tts-1",
    apiKey: config.apiKey || "",
    endpoint: config.endpoint || "",
    enabled: config.enabled !== false
  };

  assertTtsConfig(finalConfig);

  if (finalConfig.provider === "browser") {
    return speakWithBrowser(cleanText, finalConfig.voiceId);
  }

  if (finalConfig.provider === "openai") {
    return speakWithOpenAI({
      text: cleanText,
      voiceId: finalConfig.voiceId,
      model: finalConfig.model,
      apiKey: finalConfig.apiKey,
      endpoint: finalConfig.endpoint
    });
  }

  if (finalConfig.provider === "azure") {
    return speakWithAzure({
      text: cleanText,
      voiceId: finalConfig.voiceId,
      apiKey: finalConfig.apiKey,
      endpoint: finalConfig.endpoint
    });
  }

  if (finalConfig.provider === "custom") {
    return speakWithCustom({
      text: cleanText,
      voice: finalConfig.voice,
      voiceId: finalConfig.voiceId,
      model: finalConfig.model,
      apiKey: finalConfig.apiKey,
      endpoint: finalConfig.endpoint
    });
  }

  throw new Error(`暂不支持的 TTS 服务商：${finalConfig.provider}`);
}

export async function speakCharacterText(character = {}, text = "") {
  const config = getCharacterTtsConfig(character);

  if (!config.enabled) {
    return false;
  }

  return speakText(text, config);
}

export function getResolvedTtsConfig(character = {}) {
  return getCharacterTtsConfig(character);
}

export function canUseTts(character = {}) {
  const config = getCharacterTtsConfig(character);

  if (!config.enabled) {
    return false;
  }

  if (config.provider === "browser") {
    return true;
  }

  return Boolean(config.provider && (config.voice || config.voiceId) && config.apiKey);
}

export function getBrowserVoiceList() {
  if (!("speechSynthesis" in window)) {
    return [];
  }

  return window.speechSynthesis.getVoices().map((voice) => ({
    name: voice.name,
    voiceURI: voice.voiceURI,
    lang: voice.lang,
    localService: voice.localService,
    default: voice.default
  }));
}

export function loadBrowserVoices() {
  if (!("speechSynthesis" in window)) {
    return Promise.resolve([]);
  }

  return new Promise((resolve) => {
    const voices = window.speechSynthesis.getVoices();

    if (voices.length > 0) {
      resolve(getBrowserVoiceList());
      return;
    }

    window.speechSynthesis.onvoiceschanged = () => {
      resolve(getBrowserVoiceList());
    };

    window.setTimeout(() => {
      resolve(getBrowserVoiceList());
    }, 800);
  });
}

export async function decideVoiceBehavior({
  character,
  latestUserMessage = "",
  latestAiMessage = "",
  chatHistory = [],
  scene = "chat"
} = {}) {
  const config = getCharacterTtsConfig(character);

  if (!character || !character.id) {
    return {
      speak: false,
      call: false,
      reason: "缺少角色"
    };
  }

  if (!config.autoVoiceDecision && !config.autoSpeak && !config.allowCallIntent) {
    return {
      speak: false,
      call: false,
      reason: "未开启自动语音判断"
    };
  }

  const apiConfig = getResolvedCharacterApiConfig(character);

  if (!apiConfig.endpoint || !apiConfig.model) {
    return {
      speak: false,
      call: false,
      reason: "缺少 API 配置"
    };
  }

  const recentText = Array.isArray(chatHistory)
    ? chatHistory
        .slice(-8)
        .map((message) => {
          const role = message.role === "assistant" ? character.name || "AI" : "用户";
          return `${role}：${message.content || ""}`;
        })
        .join("\n")
    : "";

  const result = await silentJsonRequest({
    systemPrompt: [
      character.systemPrompt || "",
      "你要判断当前这个角色在这一轮互动后，是否适合用语音回复，或者是否想发起电话。",
      "只判断行为，不要继续聊天。",
      "不要使用表情符号。",
      "必须只返回 JSON。"
    ].join("\n\n"),
    prompt: [
      `当前时间：${getNowInfo().localText}`,
      `互动场景：${scene}`,
      "",
      "最近聊天：",
      recentText || "无",
      "",
      `用户最新消息：${latestUserMessage || "无"}`,
      `AI 最新回复：${latestAiMessage || "无"}`,
      "",
      "判断规则：",
      "1. 如果这段回复更像轻声安慰、认真表达、道歉、安抚、紧急提醒，可以 speak 为 true。",
      "2. 如果只是普通短回复，不要频繁发语音。",
      "3. 如果用户明确要求语音，speak 可以为 true。",
      "4. 如果用户明确要求电话，或者剧情上角色非常想立刻通话，call 可以为 true。",
      "5. call 为 true 时，电话界面会接管后续互动。",
      "6. 不要让每轮都 speak 或 call。",
      "",
      "返回格式：",
      "{\"speak\": true或false, \"call\": true或false, \"reason\": \"一句话原因\", \"voiceText\": \"要朗读或电话开场的文本，可为空\", \"callTitle\": \"电话标题，可为空\"}"
    ].join("\n"),
    endpoint: apiConfig.endpoint,
    apiKey: apiConfig.apiKey,
    model: apiConfig.model,
    temperature: 0.2,
    fallback: {
      speak: false,
      call: false,
      reason: "判断失败",
      voiceText: "",
      callTitle: ""
    }
  });

  return {
    speak: Boolean(result?.speak),
    call: Boolean(result?.call),
    reason: String(result?.reason || ""),
    voiceText: String(result?.voiceText || latestAiMessage || "").trim(),
    callTitle: String(result?.callTitle || "").trim()
  };
}

export async function maybeSpeakAfterReply({
  character,
  latestUserMessage = "",
  latestAiMessage = "",
  chatHistory = [],
  scene = "chat",
  force = false
} = {}) {
  const config = getCharacterTtsConfig(character);

  if (!config.enabled) {
    return {
      spoken: false,
      call: false,
      startedCall: false,
      reason: "TTS 未启用"
    };
  }

  if (force || config.autoSpeak) {
    await speakCharacterText(character, latestAiMessage);

    return {
      spoken: true,
      call: false,
      startedCall: false,
      reason: force ? "手动播放" : "自动朗读"
    };
  }

  const decision = await decideVoiceBehavior({
    character,
    latestUserMessage,
    latestAiMessage,
    chatHistory,
    scene
  });

  if (decision.call && config.allowCallIntent) {
    const started = await openCallInterface({
      character,
      openingText: decision.voiceText || latestAiMessage || "",
      callTitle: decision.callTitle || `${character.name || "角色"}想和你通话`
    });

    return {
      spoken: false,
      call: false,
      startedCall: started,
      reason: decision.reason,
      callTitle: decision.callTitle || `${character.name || "角色"}想和你通话`
    };
  }

  if (decision.speak) {
    await speakCharacterText(character, decision.voiceText || latestAiMessage);

    return {
      spoken: true,
      call: false,
      startedCall: false,
      reason: decision.reason
    };
  }

  return {
    spoken: false,
    call: false,
    startedCall: false,
    reason: decision.reason
  };
}
